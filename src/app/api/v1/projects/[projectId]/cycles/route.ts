import { prisma } from "@/lib/prisma";
import {
  requireApiKey,
  coercePage,
  coercePageSize,
  parseUpdatedSince,
} from "@/lib/api-auth";
import type { ExecutionStatus } from "@prisma/client";

export const runtime = "nodejs";

/**
 * Public read API — list a project's test cycles, newest first, each with its
 * execution status counts. This is what a dashboard uses to pick the "current"
 * cycle(s) and compute pass-rates / readiness.
 *
 *   GET /api/v1/projects/{projectId}/cycles
 *     ?page=0&pageSize=50&updatedSince=...&folderId=...
 *   Authorization: Bearer <api key>   (scope: cycles:read)
 *
 * Ordering: by `keyNum` descending (higher cycle key = newer), so `data[0]` is
 * the latest cycle. Each row carries `startDate`/`endDate`/`createdAt` so the
 * consumer can map cycles to its own sprint windows, plus per-status `counts`.
 */
const ALL_STATUSES: ExecutionStatus[] = [
  "not_executed",
  "in_progress",
  "pass",
  "pass_auto",
  "fail",
  "blocked",
];

function zeroCounts(): Record<ExecutionStatus, number> {
  return Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
    ExecutionStatus,
    number
  >;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const auth = await requireApiKey(req, "cycles:read", projectId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = coercePage(url.searchParams.get("page"));
  const pageSize = coercePageSize(url.searchParams.get("pageSize"));
  const updatedSince = parseUpdatedSince(url.searchParams.get("updatedSince"));
  const folderId = url.searchParams.get("folderId")?.trim();

  const where = {
    projectId,
    ...(folderId ? { folderId } : {}),
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.testRun.findMany({
      where,
      // Higher key = newer (matches how cycles are keyed); createdAt breaks ties
      // and orders any key-less rows.
      orderBy: [{ keyNum: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        key: true,
        keyNum: true,
        name: true,
        status: true,
        environment: true,
        version: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        folder: { select: { id: true, name: true } },
      },
    }),
    prisma.testRun.count({ where }),
  ]);

  // One grouped query for the status counts of every cycle on this page.
  const ids = rows.map((r) => r.id);
  const grouped =
    ids.length > 0
      ? await prisma.testExecution.groupBy({
          by: ["runId", "status"],
          where: { runId: { in: ids } },
          _count: { _all: true },
        })
      : [];

  const countsByRun = new Map<string, Record<ExecutionStatus, number>>();
  for (const g of grouped) {
    const rec = countsByRun.get(g.runId) ?? zeroCounts();
    rec[g.status] = g._count._all;
    countsByRun.set(g.runId, rec);
  }

  const data = rows.map((c) => {
    const counts = countsByRun.get(c.id) ?? zeroCounts();
    const totalExecs = ALL_STATUSES.reduce((n, s) => n + counts[s], 0);
    const passed = counts.pass + counts.pass_auto;
    const executed = totalExecs - counts.not_executed - counts.in_progress;
    return {
      key: c.key,
      keyNum: c.keyNum,
      name: c.name,
      status: c.status,
      environment: c.environment,
      version: c.version,
      folder: c.folder ? { id: c.folder.id, name: c.folder.name } : null,
      startDate: c.startDate ? c.startDate.toISOString() : null,
      endDate: c.endDate ? c.endDate.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      counts: { total: totalExecs, ...counts },
      executed,
      passed,
      passRate: executed > 0 ? Math.round((passed / executed) * 1000) / 10 : null,
    };
  });

  return Response.json({
    data,
    page,
    pageSize,
    total,
    hasMore: (page + 1) * pageSize < total,
  });
}
