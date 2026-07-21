"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireProjectRole,
  requireUser,
  effectiveRole,
  roleAtLeast,
} from "@/lib/auth";
import { nextCycleKey, parseKey } from "@/lib/keys";
import type { ExecutionStatus, CycleStatus, Prisma } from "@prisma/client";

// ---- Cycles ---------------------------------------------------------------

export async function createCycle(
  projectId: string,
  input: {
    name: string;
    folderId?: string | null;
    description?: string;
    status?: CycleStatus;
    version?: string;
    iteration?: string;
    environment?: string;
    ownerName?: string;
    startDate?: string | null;
    endDate?: string | null;
    customFields?: Record<string, string>;
  }
): Promise<{ id: string; key: string | null }> {
  const { user } = await requireProjectRole(projectId, "lead");
  const key = await nextCycleKey(projectId);
  const run = await prisma.testRun.create({
    data: {
      projectId,
      key,
      keyNum: parseKey(key)?.num ?? null,
      name: input.name.trim() || "Untitled cycle",
      status: input.status ?? "not_executed",
      folderId: input.folderId || null,
      description: input.description?.trim() || null,
      environment: input.environment?.trim() || null,
      version: input.version?.trim() || null,
      iteration: input.iteration?.trim() || null,
      ownerName: input.ownerName?.trim() || user.name || user.email,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      customFields: (input.customFields ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true, key: true },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
  return run;
}

/** Autosave a partial update to a cycle (inline Details editor). */
export async function autosaveCycle(
  cycleId: string,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { error: string }> {
  // Hot path (autosave on blur): membership role rides along with the cycle
  // fetch so authorization costs no extra round trip.
  const user = await requireUser();
  const run = await prisma.testRun.findFirst({
    where: { id: cycleId },
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          members: { where: { userId: user.id }, select: { role: true } },
        },
      },
    },
  });
  if (!run) return { error: "Not found" };
  const role = effectiveRole(user, run.project.members[0]?.role);
  if (!role || !roleAtLeast(role, "lead")) {
    return { error: "You need the lead role to edit cycles" };
  }

  const data: Record<string, unknown> = {};
  if ("name" in patch) data.name = String(patch.name ?? "");
  for (const f of ["description", "environment", "version", "iteration", "ownerName"]) {
    if (f in patch) data[f] = patch[f] ? String(patch[f]) : null;
  }
  if ("status" in patch) data.status = patch.status;
  if ("startDate" in patch)
    data.startDate = patch.startDate ? new Date(String(patch.startDate)) : null;
  if ("endDate" in patch)
    data.endDate = patch.endDate ? new Date(String(patch.endDate)) : null;
  if ("customFields" in patch) data.customFields = patch.customFields;
  if ("folderId" in patch) {
    const fid = patch.folderId ? String(patch.folderId) : null;
    if (fid) {
      const f = await prisma.cycleFolder.findFirst({
        where: { id: fid, projectId: run.projectId },
        select: { id: true },
      });
      if (f) data.folderId = fid;
    } else {
      data.folderId = null;
    }
  }

  if (Object.keys(data).length === 0) return { ok: true };
  await prisma.testRun.update({
    where: { id: cycleId },
    data: data as Prisma.TestRunUncheckedUpdateInput,
  });
  return { ok: true };
}

export async function cloneCycles(projectId: string, cycleIds: string[]) {
  const { user } = await requireProjectRole(projectId, "lead");
  // One query for all sources (ordered as selected) instead of one per cycle.
  const found = await prisma.testRun.findMany({
    where: { id: { in: cycleIds }, projectId },
    include: { executions: { select: { caseId: true } } },
  });
  const byId = new Map(found.map((s) => [s.id, s]));
  for (const id of cycleIds) {
    const src = byId.get(id);
    if (!src) continue;
    const key = await nextCycleKey(projectId);
    await prisma.testRun.create({
      data: {
        projectId,
        key,
        keyNum: parseKey(key)?.num ?? null,
        name: `${src.name} (Copy)`,
        description: src.description,
        environment: src.environment,
        folderId: src.folderId,
        ownerName: user.name ?? user.email,
        // Copy the case set, reset to not-executed.
        executions: {
          create: src.executions.map((e) => ({
            caseId: e.caseId,
            status: "not_executed" as ExecutionStatus,
          })),
        },
      },
    });
  }
  revalidatePath(`/projects/${projectId}/cycles`);
}

export async function deleteCycles(projectId: string, cycleIds: string[]) {
  await requireProjectRole(projectId, "admin");
  await prisma.testRun.deleteMany({
    where: { id: { in: cycleIds }, projectId },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
}

export async function moveCycle(
  projectId: string,
  cycleId: string,
  folderId: string | null
) {
  await requireProjectRole(projectId, "lead");
  if (folderId) {
    const f = await prisma.cycleFolder.findFirst({
      where: { id: folderId, projectId },
      select: { id: true },
    });
    if (!f) throw new Error("Folder not found");
  }
  await prisma.testRun.updateMany({
    where: { id: cycleId, projectId },
    data: { folderId },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
}

// ---- Cycle folders --------------------------------------------------------

export async function addCycleFolder(
  projectId: string,
  name: string,
  parentFolderId: string | null
) {
  await requireProjectRole(projectId, "lead");
  const clean = name.trim();
  if (!clean) throw new Error("Folder name is required");
  const created = await prisma.cycleFolder.create({
    data: { projectId, name: clean, parentFolderId },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
  return { id: created.id };
}

export async function renameCycleFolder(
  projectId: string,
  folderId: string,
  name: string
) {
  await requireProjectRole(projectId, "lead");
  const clean = name.trim();
  if (!clean) throw new Error("Folder name is required");
  // Scoped so a forged id can't rename another project's folder.
  await prisma.cycleFolder.updateMany({
    where: { id: folderId, projectId },
    data: { name: clean },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
}

export async function removeCycleFolder(projectId: string, folderId: string) {
  await requireProjectRole(projectId, "admin");
  const f = await prisma.cycleFolder.findFirst({
    where: { id: folderId, projectId },
    select: { id: true },
  });
  if (!f) throw new Error("Not found");
  await prisma.cycleFolder.delete({ where: { id: folderId } });
  revalidatePath(`/projects/${projectId}/cycles`);
}

export async function moveCycleFolder(
  projectId: string,
  folderId: string,
  parentFolderId: string | null
) {
  await requireProjectRole(projectId, "lead");
  if (folderId === parentFolderId) throw new Error("Cannot nest into itself");
  const folders = await prisma.cycleFolder.findMany({
    where: { projectId },
    select: { id: true, parentFolderId: true },
  });
  if (!folders.some((f) => f.id === folderId)) throw new Error("Not found");
  // Reject dropping into own subtree.
  const childrenOf = new Map<string | null, string[]>();
  for (const f of folders) {
    const arr = childrenOf.get(f.parentFolderId) ?? [];
    arr.push(f.id);
    childrenOf.set(f.parentFolderId, arr);
  }
  const descendants = new Set<string>();
  const stack = [folderId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const ch of childrenOf.get(cur) ?? []) {
      if (!descendants.has(ch)) {
        descendants.add(ch);
        stack.push(ch);
      }
    }
  }
  if (parentFolderId && descendants.has(parentFolderId))
    throw new Error("Cannot move a folder into its own subfolder");
  await prisma.cycleFolder.update({
    where: { id: folderId },
    data: { parentFolderId },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
}

// ---- Executions (results within a cycle) ---------------------------------

export async function addCasesToCycle(cycleId: string, caseIds: string[]) {
  const run = await prisma.testRun.findFirst({
    where: { id: cycleId },
    select: { id: true, projectId: true },
  });
  if (!run) throw new Error("Forbidden");
  await requireProjectRole(run.projectId, "lead");
  if (caseIds.length === 0) return { added: 0 };

  // Only link cases that belong to the cycle's project.
  const valid = await prisma.testCase.findMany({
    where: { id: { in: caseIds }, suite: { projectId: run.projectId } },
    select: { id: true },
  });

  const res = await prisma.testExecution.createMany({
    data: valid.map((c) => ({
      runId: cycleId,
      caseId: c.id,
      status: "not_executed" as ExecutionStatus,
    })),
    skipDuplicates: true,
  });
  revalidatePath(`/projects/${run.projectId}/cycles`);
  return { added: res.count };
}

export async function removeExecution(executionId: string) {
  const ex = await prisma.testExecution.findFirst({
    where: { id: executionId },
    select: { id: true, run: { select: { projectId: true } } },
  });
  if (!ex) throw new Error("Forbidden");
  await requireProjectRole(ex.run.projectId, "lead");
  await prisma.testExecution.delete({ where: { id: executionId } });
}

/** True if any step's Actual Result HTML embeds an image (counts as evidence). */
function stepResultsHaveImage(results: unknown): boolean {
  if (!Array.isArray(results)) return false;
  return results.some(
    (r) =>
      r &&
      typeof r === "object" &&
      typeof (r as { actual?: unknown }).actual === "string" &&
      /<img\b/i.test((r as { actual: string }).actual)
  );
}

export async function recordExecution(
  executionId: string,
  patch: {
    status?: ExecutionStatus;
    notes?: string;
    defectRef?: string;
    stepResults?: unknown;
    environment?: string;
    iteration?: string;
    releaseVersion?: string;
    assignedToId?: string | null;
    assignedToName?: string | null;
    actualTime?: number | null;
  }
): Promise<{ ok: true } | { error: string }> {
  // Hot path (fires per step click in the Test Player): membership role rides
  // along with the execution fetch so authorization costs no extra round trip.
  const user = await requireUser();
  const ex = await prisma.testExecution.findFirst({
    where: { id: executionId },
    select: {
      id: true,
      run: {
        select: {
          projectId: true,
          project: {
            select: {
              members: { where: { userId: user.id }, select: { role: true } },
            },
          },
        },
      },
      stepResults: true,
      _count: { select: { attachmentFiles: true } },
    },
  });
  if (!ex) return { error: "Not found" };
  const role = effectiveRole(user, ex.run.project.members[0]?.role);
  if (!role || !roleAtLeast(role, "tester")) {
    return { error: "You need the tester role to record results" };
  }

  // Evidence gate: a manual "Pass" needs evidence — either an execution
  // attachment, or an image embedded in a step's Actual Result. Only applies
  // here, so DeviceCloud automation (which writes executions directly, and has
  // the console_url as its evidence) is unaffected.
  if (patch.status === "pass" && ex._count.attachmentFiles === 0) {
    // Prefer the incoming stepResults (same save), else what's already stored.
    const results =
      "stepResults" in patch ? patch.stepResults : ex.stepResults;
    if (!stepResultsHaveImage(results)) {
      return {
        error:
          "Add evidence (an attachment or an image in the actual result) before marking this case as Passed",
      };
    }
  }

  const data: Record<string, unknown> = {};
  if (patch.status) {
    data.status = patch.status;
    if (patch.status === "not_executed") {
      // Reverting to not-executed clears who/when it was executed.
      data.executedAt = null;
      data.executedById = null;
    } else {
      data.executedAt = new Date();
      data.executedById = user.id;
    }
  }
  if ("notes" in patch) data.notes = patch.notes || null;
  if ("defectRef" in patch) data.defectRef = patch.defectRef || null;
  if ("stepResults" in patch)
    data.stepResults = patch.stepResults as Prisma.InputJsonValue;
  for (const f of ["environment", "iteration", "releaseVersion", "assignedToName"] as const) {
    if (f in patch) data[f] = patch[f] ? String(patch[f]) : null;
  }
  // Assignee FK is authoritative: resolve the display name server-side from
  // the project roster (overrides any assignedToName in the same patch).
  if ("assignedToId" in patch) {
    if (patch.assignedToId) {
      const member = await prisma.projectMember.findFirst({
        where: { projectId: ex.run.projectId, userId: patch.assignedToId },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      if (!member) return { error: "Assignee is not a member of this project" };
      data.assignedToId = member.user.id;
      data.assignedToName = member.user.name ?? member.user.email;
    } else {
      data.assignedToId = null;
      data.assignedToName = null;
    }
  }
  if ("actualTime" in patch)
    data.actualTime = patch.actualTime == null ? null : Number(patch.actualTime);

  await prisma.testExecution.update({ where: { id: executionId }, data });
  return { ok: true };
}
