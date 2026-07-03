"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

async function assertMember(projectId: string, userId: string) {
  const p = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    select: { id: true },
  });
  if (!p) throw new Error("Forbidden");
}

/** Move a single case into a different suite (drag-drop onto a folder). */
export async function moveCase(
  projectId: string,
  caseId: string,
  targetSuiteId: string
) {
  const user = await requireUser();
  await assertMember(projectId, user.id);

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
  const user = await requireUser();
  await assertMember(projectId, user.id);
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

/** Duplicate the given cases within their current suites. */
export async function cloneCases(projectId: string, caseIds: string[]) {
  const user = await requireUser();
  await assertMember(projectId, user.id);
  if (caseIds.length === 0) return { cloned: 0 };

  const cases = await prisma.testCase.findMany({
    where: { id: { in: caseIds }, suite: { projectId } },
  });

  for (const c of cases) {
    await prisma.testCase.create({
      data: {
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
      },
    });
  }
  revalidatePath(`/projects/${projectId}`);
  return { cloned: cases.length };
}

/** Archive or restore the given cases. */
export async function archiveCases(
  projectId: string,
  caseIds: string[],
  archived: boolean
) {
  const user = await requireUser();
  await assertMember(projectId, user.id);
  if (caseIds.length === 0) return { updated: 0 };

  const res = await prisma.testCase.updateMany({
    where: { id: { in: caseIds }, suite: { projectId } },
    data: { archived, archivedAt: archived ? new Date() : null },
  });
  revalidatePath(`/projects/${projectId}`);
  return { updated: res.count };
}
