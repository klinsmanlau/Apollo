"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextCycleKey, parseKey } from "@/lib/keys";
import type { ExecutionStatus, CycleStatus, Prisma } from "@prisma/client";

async function assertMember(projectId: string, userId: string) {
  const p = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    select: { id: true },
  });
  if (!p) throw new Error("Forbidden");
}

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
  const user = await requireUser();
  await assertMember(projectId, user.id);
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
  const user = await requireUser();
  const run = await prisma.testRun.findFirst({
    where: { id: cycleId, project: { members: { some: { userId: user.id } } } },
    select: { id: true, projectId: true },
  });
  if (!run) return { error: "Not found" };

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
  const user = await requireUser();
  await assertMember(projectId, user.id);
  for (const id of cycleIds) {
    const src = await prisma.testRun.findFirst({
      where: { id, projectId },
      include: { executions: { select: { caseId: true } } },
    });
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
  const user = await requireUser();
  await assertMember(projectId, user.id);
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
  const user = await requireUser();
  await assertMember(projectId, user.id);
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
  const user = await requireUser();
  await assertMember(projectId, user.id);
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
  const user = await requireUser();
  await assertMember(projectId, user.id);
  const clean = name.trim();
  if (!clean) throw new Error("Folder name is required");
  await prisma.cycleFolder.update({
    where: { id: folderId },
    data: { name: clean },
  });
  revalidatePath(`/projects/${projectId}/cycles`);
}

export async function removeCycleFolder(projectId: string, folderId: string) {
  const user = await requireUser();
  await assertMember(projectId, user.id);
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
  const user = await requireUser();
  await assertMember(projectId, user.id);
  if (folderId === parentFolderId) throw new Error("Cannot nest into itself");
  const folders = await prisma.cycleFolder.findMany({
    where: { projectId },
    select: { id: true, parentFolderId: true },
  });
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
  const user = await requireUser();
  const run = await prisma.testRun.findFirst({
    where: {
      id: cycleId,
      project: { members: { some: { userId: user.id } } },
    },
    select: { id: true, projectId: true },
  });
  if (!run) throw new Error("Forbidden");
  if (caseIds.length === 0) return { added: 0 };

  const res = await prisma.testExecution.createMany({
    data: caseIds.map((caseId) => ({
      runId: cycleId,
      caseId,
      status: "not_executed" as ExecutionStatus,
    })),
    skipDuplicates: true,
  });
  revalidatePath(`/projects/${run.projectId}/cycles`);
  return { added: res.count };
}

export async function removeExecution(executionId: string) {
  const user = await requireUser();
  const ex = await prisma.testExecution.findFirst({
    where: {
      id: executionId,
      run: { project: { members: { some: { userId: user.id } } } },
    },
    select: { id: true },
  });
  if (!ex) throw new Error("Forbidden");
  await prisma.testExecution.delete({ where: { id: executionId } });
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
    assignedToName?: string;
    actualTime?: number | null;
  }
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const ex = await prisma.testExecution.findFirst({
    where: {
      id: executionId,
      run: { project: { members: { some: { userId: user.id } } } },
    },
    select: { id: true },
  });
  if (!ex) return { error: "Not found" };

  const data: Record<string, unknown> = {};
  if (patch.status) {
    data.status = patch.status;
    if (patch.status === "not_executed") {
      data.executedAt = null;
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
  if ("actualTime" in patch)
    data.actualTime = patch.actualTime == null ? null : Number(patch.actualTime);

  await prisma.testExecution.update({ where: { id: executionId }, data });
  return { ok: true };
}
