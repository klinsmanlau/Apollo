"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { nextCaseKeys, parseKey } from "@/lib/keys";

/** Move a single case into a different suite (drag-drop onto a folder). */
export async function moveCase(
  projectId: string,
  caseId: string,
  targetSuiteId: string
) {
  await requireProjectRole(projectId, "lead");

  const [suite, tc] = await Promise.all([
    prisma.testSuite.findFirst({
      where: { id: targetSuiteId, projectId },
      select: { id: true },
    }),
    prisma.testCase.findFirst({
      where: { id: caseId, suite: { projectId } },
      select: { id: true },
    }),
  ]);
  if (!suite || !tc) throw new Error("Not found");

  await prisma.testCase.update({
    where: { id: caseId },
    data: { suiteId: targetSuiteId },
  });
  revalidatePath(`/projects/${projectId}`);
}

/** Re-nest a folder under a new parent (or to top level with null). */
export async function moveSuite(
  projectId: string,
  suiteId: string,
  parentSuiteId: string | null
) {
  await requireProjectRole(projectId, "lead");
  if (suiteId === parentSuiteId) throw new Error("Cannot nest a folder into itself");

  const suites = await prisma.testSuite.findMany({
    where: { projectId },
    select: { id: true, parentSuiteId: true },
  });
  const self = suites.find((s) => s.id === suiteId);
  if (!self) throw new Error("Not found");

  // Reject dropping a folder into its own subtree (would create a cycle).
  const childrenOf = new Map<string | null, string[]>();
  for (const s of suites) {
    const arr = childrenOf.get(s.parentSuiteId) ?? [];
    arr.push(s.id);
    childrenOf.set(s.parentSuiteId, arr);
  }
  const descendants = new Set<string>();
  const stack = [suiteId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const ch of childrenOf.get(cur) ?? []) {
      if (!descendants.has(ch)) {
        descendants.add(ch);
        stack.push(ch);
      }
    }
  }
  if (parentSuiteId && descendants.has(parentSuiteId)) {
    throw new Error("Cannot move a folder into its own subfolder");
  }
  if (parentSuiteId) {
    const parent = suites.find((s) => s.id === parentSuiteId);
    if (!parent) throw new Error("Target folder not found");
  }

  await prisma.testSuite.update({
    where: { id: suiteId },
    data: { parentSuiteId },
  });
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Reorder a folder within a level: move `suiteId` under `parentSuiteId` and
 * place it immediately before `beforeSuiteId` (or at the end when null).
 * Renormalizes the target level's positions to 0,10,20… in one pass.
 */
export async function reorderSuite(
  projectId: string,
  suiteId: string,
  parentSuiteId: string | null,
  beforeSuiteId: string | null
) {
  await requireProjectRole(projectId, "lead");
  if (suiteId === parentSuiteId) throw new Error("Cannot nest a folder into itself");
  if (suiteId === beforeSuiteId) return; // dropping onto itself → no-op

  const suites = await prisma.testSuite.findMany({
    where: { projectId },
    select: { id: true, parentSuiteId: true, position: true, name: true },
  });
  const self = suites.find((s) => s.id === suiteId);
  if (!self) throw new Error("Not found");

  // Prevent moving a folder into its own subtree (cycle).
  const childrenOf = new Map<string | null, string[]>();
  for (const s of suites) {
    const arr = childrenOf.get(s.parentSuiteId) ?? [];
    arr.push(s.id);
    childrenOf.set(s.parentSuiteId, arr);
  }
  const descendants = new Set<string>();
  const stack = [suiteId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const ch of childrenOf.get(cur) ?? []) {
      if (!descendants.has(ch)) {
        descendants.add(ch);
        stack.push(ch);
      }
    }
  }
  if (parentSuiteId && descendants.has(parentSuiteId)) {
    throw new Error("Cannot move a folder into its own subfolder");
  }

  // Siblings at the destination level (excluding the dragged folder), ordered.
  const siblings = suites
    .filter((s) => s.parentSuiteId === parentSuiteId && s.id !== suiteId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  // Find where the dragged folder is being inserted, then give it a position
  // BETWEEN its new neighbors (gap/fractional positioning) — so we only write
  // the one moved row, not the whole level. Positions can be non-contiguous.
  const idx = beforeSuiteId ? siblings.findIndex((s) => s.id === beforeSuiteId) : siblings.length;
  const prevPos = idx > 0 ? siblings[idx - 1].position : null; // folder above the slot
  const nextPos = idx < siblings.length ? siblings[idx].position : null; // folder below

  let newPos: number;
  if (prevPos == null && nextPos == null) newPos = 0; // only child
  else if (prevPos == null) newPos = nextPos! - 10; // dropped at the top
  else if (nextPos == null) newPos = prevPos + 10; // dropped at the bottom
  else newPos = Math.floor((prevPos + nextPos) / 2); // between two folders (Int column)

  const data: { position: number; parentSuiteId?: string | null } = { position: newPos };
  if (self.parentSuiteId !== parentSuiteId) data.parentSuiteId = parentSuiteId;

  // One UPDATE regardless of how many siblings exist.
  await prisma.testSuite.update({ where: { id: suiteId }, data });

  // If two neighbors collided (gap exhausted to <1), renormalize this level.
  if (prevPos != null && nextPos != null && nextPos - prevPos <= 1) {
    const level = [...siblings];
    level.splice(idx, 0, { ...self, position: newPos });
    await prisma.$transaction(
      level.map((s, i) =>
        prisma.testSuite.update({ where: { id: s.id }, data: { position: i * 100 } })
      )
    );
  }
}

/** Duplicate the given cases within their current suites. */
export async function cloneCases(projectId: string, caseIds: string[]) {
  const { user } = await requireProjectRole(projectId, "lead");
  if (caseIds.length === 0) return { cloned: 0 };

  const cases = await prisma.testCase.findMany({
    where: { id: { in: caseIds }, suite: { projectId } },
  });

  // One round trip to reserve the key block, one createMany for the copies —
  // instead of two sequential queries per cloned case.
  const keys = await nextCaseKeys(projectId, cases.length);
  await prisma.testCase.createMany({
    data: cases.map((c, i) => ({
      key: keys[i],
      keyNum: parseKey(keys[i])?.num ?? null,
      suiteId: c.suiteId,
      title: `${c.title} (Copy)`,
      objective: c.objective,
      preconditions: c.preconditions,
      scriptType: c.scriptType,
      steps: c.steps as Prisma.InputJsonValue,
      scriptBody: c.scriptBody,
      expectedResult: c.expectedResult,
      priority: c.priority,
      type: c.type,
      status: c.status,
      component: c.component,
      ownerName: c.ownerName,
      estimatedTime: c.estimatedTime,
      tags: c.tags,
      coverage: c.coverage,
      customFields: c.customFields as Prisma.InputJsonValue,
      // A clone is a fresh case: no source key, not archived.
      sourceKey: null,
      createdById: user.id,
    })),
  });
  revalidatePath(`/projects/${projectId}`);
  return { cloned: cases.length };
}

/** Create a folder (optionally under a parent). Returns the new suite id. */
export async function addSuite(
  projectId: string,
  name: string,
  parentSuiteId: string | null
) {
  await requireProjectRole(projectId, "lead");
  const clean = name.trim();
  if (!clean) throw new Error("Folder name is required");

  if (parentSuiteId) {
    const parent = await prisma.testSuite.findFirst({
      where: { id: parentSuiteId, projectId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent folder not found");
  }

  const created = await prisma.testSuite.create({
    data: { projectId, name: clean, parentSuiteId },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
  return { id: created.id };
}

/** Rename a folder. */
export async function renameSuite(
  projectId: string,
  suiteId: string,
  name: string
) {
  await requireProjectRole(projectId, "lead");
  const clean = name.trim();
  if (!clean) throw new Error("Folder name is required");

  await prisma.testSuite.update({
    where: { id: suiteId },
    data: { name: clean },
  });
  revalidatePath(`/projects/${projectId}`);
}

/** Delete a folder (cascades to subfolders and their cases). Admin only. */
export async function removeSuite(projectId: string, suiteId: string) {
  await requireProjectRole(projectId, "admin");
  const suite = await prisma.testSuite.findFirst({
    where: { id: suiteId, projectId },
    select: { id: true },
  });
  if (!suite) throw new Error("Not found");
  await prisma.testSuite.delete({ where: { id: suiteId } });
  revalidatePath(`/projects/${projectId}`);
}

/** Archive or restore the given cases. */
export async function archiveCases(
  projectId: string,
  caseIds: string[],
  archived: boolean
) {
  await requireProjectRole(projectId, "lead");
  if (caseIds.length === 0) return { updated: 0 };

  const res = await prisma.testCase.updateMany({
    where: { id: { in: caseIds }, suite: { projectId } },
    data: { archived, archivedAt: archived ? new Date() : null },
  });
  revalidatePath(`/projects/${projectId}`);
  return { updated: res.count };
}
