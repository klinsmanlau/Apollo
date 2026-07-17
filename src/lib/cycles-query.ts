import { prisma } from "@/lib/prisma";
import type { Prisma, ExecutionStatus } from "@prisma/client";

export const CYCLE_PAGE_SIZE = 50;

export type CycleScope = { folderIds?: string[] };
export type CycleSort = "key" | "name";
export type SortDir = "asc" | "desc";

export type CycleRow = {
  id: string;
  key: string | null;
  name: string;
  folderId: string | null;
  total: number;
  executed: number;
  passed: number;
  passedAuto: number;
  failed: number;
  blocked: number;
  inProgress: number;
  progress: number; // 0..100 (share executed)
  status: "not_executed" | "in_progress" | "done";
};

/** Subtree of a cycle folder (inclusive). */
export async function getCycleSubtreeIds(
  projectId: string,
  folderId: string
): Promise<string[]> {
  const folders = await prisma.cycleFolder.findMany({
    where: { projectId },
    select: { id: true, parentFolderId: true },
  });
  const childrenOf = new Map<string | null, string[]>();
  for (const f of folders) {
    const arr = childrenOf.get(f.parentFolderId) ?? [];
    arr.push(f.id);
    childrenOf.set(f.parentFolderId, arr);
  }
  const out = new Set<string>([folderId]);
  const stack = [folderId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const ch of childrenOf.get(cur) ?? []) {
      if (!out.has(ch)) {
        out.add(ch);
        stack.push(ch);
      }
    }
  }
  return [...out];
}

function buildWhere(
  projectId: string,
  scope: CycleScope,
  q: string | undefined,
  memberClerkId?: string
): Prisma.TestRunWhereInput {
  const where: Prisma.TestRunWhereInput = memberClerkId
    ? {
        project: {
          id: projectId,
          members: { some: { user: { clerkUserId: memberClerkId } } },
        },
      }
    : { projectId };
  if (scope.folderIds && scope.folderIds.length > 0) {
    where.folderId = { in: scope.folderIds };
  }
  const term = q?.trim();
  if (term) {
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { key: { contains: term, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Direct cycle count per folder (for the tree). */
/** Key under which cycles with no folder are counted (so the "All" total is right). */
export const ROOT_COUNT_KEY = "__root";

export async function cycleFolderCounts(
  projectId: string
): Promise<Record<string, number>> {
  const grouped = await prisma.testRun.groupBy({
    by: ["folderId"],
    where: { projectId },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) {
    // Folderless cycles group under null; bucket them so the total includes them.
    out[g.folderId ?? ROOT_COUNT_KEY] = g._count._all;
  }
  return out;
}

/** One page of cycles for a scope, with progress + derived status computed. */
export async function queryCyclePage(
  projectId: string,
  scope: CycleScope,
  q: string,
  page: number,
  sort?: CycleSort,
  dir: SortDir = "asc",
  memberClerkId?: string
): Promise<{ cycles: CycleRow[]; total: number }> {
  const where = buildWhere(projectId, scope, q, memberClerkId);
  const orderBy: Prisma.TestRunOrderByWithRelationInput[] =
    sort === "name"
      ? [{ name: dir }, { id: dir }]
      : sort === "key"
        ? [{ keyNum: dir }, { key: dir }]
        : [{ createdAt: "desc" }];

  const [runs, total] = await Promise.all([
    prisma.testRun.findMany({
      where,
      select: { id: true, key: true, name: true, folderId: true, status: true },
      orderBy,
      skip: page * CYCLE_PAGE_SIZE,
      take: CYCLE_PAGE_SIZE,
    }),
    prisma.testRun.count({ where }),
  ]);

  const runIds = runs.map((r) => r.id);
  const grouped = runIds.length
    ? await prisma.testExecution.groupBy({
        by: ["runId", "status"],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      })
    : [];

  type Stat = { total: number; executed: number; passed: number; passedAuto: number; failed: number; blocked: number; inProgress: number };
  const zero = (): Stat => ({ total: 0, executed: 0, passed: 0, passedAuto: 0, failed: 0, blocked: 0, inProgress: 0 });
  const stats = new Map<string, Stat>();
  for (const g of grouped) {
    const s = stats.get(g.runId) ?? zero();
    const n = g._count._all;
    s.total += n;
    if ((g.status as ExecutionStatus) !== "not_executed") s.executed += n;
    if (g.status === "pass") s.passed += n;
    else if (g.status === "pass_auto") s.passedAuto += n;
    else if (g.status === "fail") s.failed += n;
    else if (g.status === "blocked") s.blocked += n;
    else if (g.status === "in_progress") s.inProgress += n;
    stats.set(g.runId, s);
  }

  const cycles: CycleRow[] = runs.map((r) => {
    const s = stats.get(r.id) ?? zero();
    const progress = s.total ? Math.round((s.executed / s.total) * 100) : 0;
    // Status derived from progress: every case executed → Done; any remaining
    // (or nothing executed yet) → In Progress. An empty cycle (no cases) has
    // nothing to run, so it stays Not executed.
    const status: CycleRow["status"] =
      s.total === 0 ? "not_executed" : progress >= 100 ? "done" : "in_progress";
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      folderId: r.folderId,
      total: s.total,
      executed: s.executed,
      passed: s.passed,
      passedAuto: s.passedAuto,
      failed: s.failed,
      blocked: s.blocked,
      inProgress: s.inProgress,
      progress,
      status,
    };
  });

  return { cycles, total };
}
