import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";

export const runtime = "nodejs";

const STATUS_OUT: Record<string, string> = {
  not_executed: "Not Executed",
  in_progress: "In Progress",
  pass: "Pass",
  fail: "Fail",
  blocked: "Blocked",
};

const COLUMNS = [
  "Case Key",
  "Case Name",
  "Status",
  "Tester",
  "Assigned To",
  "Executed At",
  "Environment",
  "Iteration",
  "Release Version",
  "Actual Time (s)",
  "Defect",
  "Notes",
];

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Export a cycle's execution results as .xlsx (default) or .csv. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string; cycleId: string }> }
) {
  const { projectId, cycleId } = await params;
  try {
    await requireProjectRole(projectId, "viewer");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const format =
    new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const cycle = await prisma.testRun.findFirst({
    where: { projectId, OR: [{ id: cycleId }, { key: cycleId }] },
    select: {
      id: true,
      key: true,
      name: true,
      executions: {
        orderBy: { case: { keyNum: "asc" } },
        select: {
          status: true,
          executedAt: true,
          environment: true,
          iteration: true,
          releaseVersion: true,
          assignedToName: true,
          actualTime: true,
          defectRef: true,
          notes: true,
          executedBy: { select: { name: true, email: true } },
          case: { select: { key: true, sourceKey: true, title: true } },
        },
      },
    },
  });
  if (!cycle) return new Response("Not found", { status: 404 });

  const rows = cycle.executions.map((e) => [
    e.case.key ?? e.case.sourceKey ?? "",
    e.case.title,
    STATUS_OUT[e.status] ?? e.status,
    e.executedBy?.name ?? e.executedBy?.email ?? "",
    e.assignedToName ?? "",
    e.executedAt ? e.executedAt.toISOString() : "",
    e.environment ?? "",
    e.iteration ?? "",
    e.releaseVersion ?? "",
    e.actualTime != null ? String(e.actualTime) : "",
    e.defectRef ?? "",
    e.notes ?? "",
  ]);

  const base = (cycle.key ?? "cycle").toLowerCase() + "-results";

  if (format === "csv") {
    const lines = [COLUMNS, ...rows].map((r) => r.map(csvEscape).join(","));
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Results");
  ws.addRow(COLUMNS);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => {
    col.width = i === 1 || i === 11 ? 40 : 16;
  });
  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
