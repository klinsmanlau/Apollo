import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ExecutionStatus } from "@prisma/client";
import { buildFilterWhere, type CaseFilter } from "@/lib/case-filters";

export const CASE_PAGE_SIZE = 50;

// Fields sent to the workspace table (kept minimal).
export const CASE_LIST_SELECT = {
  id: true,
  title: true,
  key: true,
  sourceKey: true,
  priority: true,
  type: true,
  status: true,
  suiteId: true,
} as const;

export type CaseScope = {
  suiteId?: string | null; // a folder → resolves that folder + its descendants
  suiteIds?: string[]; // precomputed subtree ids (skips the DB lookup)
  archived?: boolean; // archived view
};

export type CaseWhereOpts = {
  // If set, membership is enforced in the query itself (no extra round-trip).
  memberClerkId?: string;
};

/** All suite ids in the subtree rooted at `suiteId` (inclusive). */
export async function getSubtreeIds(
  projectId: string,
  suiteId: string
): Promise<string[]> {
  const suites = await prisma.testSuite.findMany({
    where: { projectId },
    select: { id: true, parentSuiteId: true },
  });
  const childrenOf = new Map<string | null, string[]>();
  for (const s of suites) {
    const arr = childrenOf.get(s.parentSuiteId) ?? [];
    arr.push(s.id);
    childrenOf.set(s.parentSuiteId, arr);
  }
  const out = new Set<string>([suiteId]);
  const stack = [suiteId];
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

/** Build the Prisma where-clause for a scope + optional search term + filters. */
export async function buildCaseWhere(
  projectId: string,
  scope: CaseScope,
  q?: string,
  opts?: CaseWhereOpts,
  filters?: CaseFilter[]
): Promise<Prisma.TestCaseWhereInput> {
  const where: Prisma.TestCaseWhereInput = {
    // Enforce project membership inside the query when a clerk id is given,
    // avoiding separate auth round-trips.
    suite: opts?.memberClerkId
      ? {
          projectId,
          project: {
            members: { some: { user: { clerkUserId: opts.memberClerkId } } },
          },
        }
      : { projectId },
    archived: !!scope.archived,
  };
  if (scope.suiteIds && scope.suiteIds.length > 0) {
    where.suiteId = { in: scope.suiteIds };
  } else if (scope.suiteId) {
    where.suiteId = { in: await getSubtreeIds(projectId, scope.suiteId) };
  }

  // Collect independent predicates that must all hold, AND-ed together. This
  // keeps the search-term OR and the filter fragment from clobbering each other.
  const and: Prisma.TestCaseWhereInput[] = [];
  const term = q?.trim();
  if (term) {
    and.push({
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { key: { contains: term, mode: "insensitive" } },
        { sourceKey: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  if (filters && filters.length > 0) {
    const filterWhere = buildFilterWhere(filters);
    if (filterWhere) and.push(filterWhere);
  }
  if (and.length > 0) where.AND = and;

  return where;
}

export type SortField = "key" | "title" | "priority" | "status";
export type SortDir = "asc" | "desc";

/** Build the orderBy for a sort field (Key sorts numerically via keyNum). */
function orderByFor(
  sort: SortField | undefined,
  dir: SortDir
): Prisma.TestCaseOrderByWithRelationInput[] {
  switch (sort) {
    case "key":
      return [{ keyNum: dir }, { key: dir }];
    case "title":
      return [{ title: dir }, { id: dir }];
    case "priority":
      return [{ priority: dir }, { id: dir }];
    case "status":
      return [{ status: dir }, { id: dir }];
    default:
      return [{ updatedAt: "desc" }];
  }
}

/** One page of cases for a scope, plus the total for that scope. */
export async function queryCasePage(
  projectId: string,
  scope: CaseScope,
  q: string,
  page: number,
  sort?: SortField,
  dir: SortDir = "asc",
  opts?: CaseWhereOpts,
  filters?: CaseFilter[]
) {
  const where = await buildCaseWhere(projectId, scope, q, opts, filters);
  const [cases, total] = await Promise.all([
    prisma.testCase.findMany({
      where,
      select: CASE_LIST_SELECT,
      orderBy: orderByFor(sort, dir),
      skip: page * CASE_PAGE_SIZE,
      take: CASE_PAGE_SIZE,
    }),
    prisma.testCase.count({ where }),
  ]);
  const lastResults = await lastResultFor(cases.map((c) => c.id));
  return {
    cases: cases.map((c) => ({
      ...c,
      lastResult: lastResults.get(c.id) ?? null,
    })),
    total,
  };
}

/**
 * Most recent recorded result per case (one DISTINCT ON query for the page's
 * ids — uses the (caseId, executedAt) index).
 */
async function lastResultFor(
  caseIds: string[]
): Promise<Map<string, ExecutionStatus>> {
  const out = new Map<string, ExecutionStatus>();
  if (caseIds.length === 0) return out;
  const rows = await prisma.$queryRaw<{ caseId: string; status: ExecutionStatus }[]>`
    SELECT DISTINCT ON ("caseId") "caseId", "status"
    FROM "TestExecution"
    WHERE "caseId" IN (${Prisma.join(caseIds)}) AND "executedAt" IS NOT NULL
    ORDER BY "caseId", "executedAt" DESC
  `;
  for (const r of rows) out.set(r.caseId, r.status);
  return out;
}

/** Direct (non-inclusive) active-case count per suite, via one aggregate. */
export async function suiteCaseCounts(
  projectId: string
): Promise<Record<string, number>> {
  const grouped = await prisma.testCase.groupBy({
    by: ["suiteId"],
    where: { suite: { projectId }, archived: false },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.suiteId] = g._count._all;
  return out;
}
