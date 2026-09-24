import { prisma } from "@/lib/prisma";
import {
  requireApiKey,
  coercePage,
  coercePageSize,
  parseUpdatedSince,
} from "@/lib/api-auth";

export const runtime = "nodejs";

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

  const [rows, total] = await Promise.all([
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
        updatedAt: true,
      },
    }),
    prisma.testCase.count({ where }),
  ]);

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
