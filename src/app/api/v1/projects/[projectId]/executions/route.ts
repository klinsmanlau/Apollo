import { prisma } from "@/lib/prisma";
import {
  requireApiKey,
  coercePage,
  coercePageSize,
  parseUpdatedSince,
} from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * Public read API — the test-results feed for a project. This is the endpoint a
 * dashboard crawls to compute coverage / pass-rates / readiness.
 *
 *   GET /api/v1/projects/{projectId}/executions
 *     ?page=0&pageSize=50&updatedSince=2026-01-01T00:00:00Z&status=pass,fail&cycleKey=TS-R96
 *   Authorization: Bearer <api key>   (scope: executions:read)
 *
 * One row per (cycle, case). Status is Apollo's `ExecutionStatus`:
 * not_executed | in_progress | pass | pass_auto | fail | blocked. Explicitly
 * mapped DTO; ordered by `updatedAt` asc for incremental crawling.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const auth = await requireApiKey(req, "executions:read", projectId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = coercePage(url.searchParams.get("page"));
  const pageSize = coercePageSize(url.searchParams.get("pageSize"));
  const updatedSince = parseUpdatedSince(url.searchParams.get("updatedSince"));
  const cycleKey = url.searchParams.get("cycleKey")?.trim();
  const caseKey = url.searchParams.get("caseKey")?.trim();

  // Optional status filter: comma-separated ExecutionStatus values.
  const STATUSES = new Set([
    "not_executed",
    "in_progress",
    "pass",
    "pass_auto",
    "fail",
    "blocked",
  ]);
  const statusParam = url.searchParams.get("status");
  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter((s) => STATUSES.has(s))
    : [];

  const where = {
    run: {
      projectId,
      ...(cycleKey ? { key: cycleKey } : {}),
    },
    ...(caseKey ? { case: { key: caseKey } } : {}),
    ...(statuses.length > 0
      ? { status: { in: statuses as ("not_executed" | "in_progress" | "pass" | "pass_auto" | "fail" | "blocked")[] } }
      : {}),
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.testExecution.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip: page * pageSize,
      take: pageSize,
      select: {
        status: true,
        environment: true,
        executedAt: true,
        actualTime: true,
        defectRef: true,
        caseVersionNo: true,
        updatedAt: true,
        case: { select: { key: true, title: true, priority: true } },
        run: { select: { key: true, name: true } },
        executedBy: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
      },
    }),
    prisma.testExecution.count({ where }),
  ]);

  const data = rows.map((e) => ({
    caseKey: e.case.key,
    caseTitle: e.case.title,
    casePriority: e.case.priority,
    cycleKey: e.run.key,
    cycleName: e.run.name,
    status: e.status,
    environment: e.environment,
    executedBy: e.executedBy?.name ?? e.executedBy?.email ?? null,
    executedAt: e.executedAt ? e.executedAt.toISOString() : null,
    assignedTo: e.assignedTo?.name ?? e.assignedTo?.email ?? null,
    actualTimeSeconds: e.actualTime,
    defectRef: e.defectRef,
    caseVersionNo: e.caseVersionNo,
    updatedAt: e.updatedAt.toISOString(),
  }));

  return Response.json({
    data,
    page,
    pageSize,
    total,
    hasMore: (page + 1) * pageSize < total,
  });
}
