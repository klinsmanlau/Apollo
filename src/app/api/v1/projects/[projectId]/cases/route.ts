import { prisma } from "@/lib/prisma";
import {
  requireApiKey,
  coercePage,
  coercePageSize,
  parseUpdatedSince,
} from "@/lib/api-auth";
import { CUSTOM_FIELDS } from "@/lib/custom-fields";

export const runtime = "nodejs";

type SuiteNode = { id: string; name: string; parentSuiteId: string | null };

/** Ancestor suite names root->leaf, walking `parentSuiteId` (cycle-guarded). */
function buildSuitePath(suiteId: string, byId: Map<string, SuiteNode>): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = suiteId;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const s: SuiteNode = byId.get(cur)!;
    path.push(s.name);
    cur = s.parentSuiteId;
  }
  return path.reverse();
}

/** The configured custom fields present on a case, as a flat string map. Limits
 *  output to the known keys (Automation Status, Risk Tier, POD, …) so the
 *  contract is stable and arbitrary imported columns don't leak. */
function pickCustomFields(bag: unknown): Record<string, string> {
  const src = bag && typeof bag === "object" ? (bag as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const cf of CUSTOM_FIELDS) {
    const v = src[cf.key];
    if (v != null && v !== "") out[cf.key] = String(v);
  }
  return out;
}

/**
 * Public read API — list test cases in a project for external integrations.
 *
 *   GET /api/v1/projects/{projectId}/cases
 *     ?page=0&pageSize=50&updatedSince=2026-01-01T00:00:00Z&includeArchived=0
 *   Authorization: Bearer <api key>   (scope: cases:read)
 *
 * Returns an explicitly-mapped DTO (never raw Prisma rows) so internal schema
 * changes can't leak fields or break integrators. Ordered by `updatedAt` asc so
 * `updatedSince` supports incremental crawling.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const auth = await requireApiKey(req, "cases:read", projectId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = coercePage(url.searchParams.get("page"));
  const pageSize = coercePageSize(url.searchParams.get("pageSize"));
  const updatedSince = parseUpdatedSince(url.searchParams.get("updatedSince"));
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  const where = {
    suite: { projectId },
    ...(includeArchived ? {} : { archived: false }),
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
  };

  const [rows, total, suites] = await Promise.all([
    prisma.testCase.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip: page * pageSize,
      take: pageSize,
      select: {
        key: true,
        title: true,
        priority: true,
        type: true,
        status: true,
        component: true,
        ownerName: true,
        tags: true,
        coverage: true,
        estimatedTime: true,
        archived: true,
        suiteId: true,
        customFields: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.testCase.count({ where }),
    // The project's suite tree, to build each case's folder path.
    prisma.testSuite.findMany({
      where: { projectId },
      select: { id: true, name: true, parentSuiteId: true },
    }),
  ]);

  const suiteById = new Map<string, SuiteNode>(suites.map((s) => [s.id, s]));

  const data = rows.map((c) => ({
    key: c.key,
    title: c.title,
    priority: c.priority,
    type: c.type,
    status: c.status,
    component: c.component,
    owner: c.ownerName,
    tags: c.tags,
    coverage: c.coverage,
    estimatedTimeSeconds: c.estimatedTime,
    archived: c.archived,
    suitePath: buildSuitePath(c.suiteId, suiteById),
    customFields: pickCustomFields(c.customFields),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return Response.json({
    data,
    page,
    pageSize,
    total,
    hasMore: (page + 1) * pageSize < total,
  });
}
