import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildCaseWhere } from "@/lib/cases-query";
import type { Step } from "@/lib/validation";

const PRIORITY_OUT: Record<string, string> = {
  low: "Low",
  medium: "Normal",
  high: "High",
};
const STATUS_OUT: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  deprecated: "Deprecated",
};

const BASE_COLUMNS = [
  "Key",
  "Name",
  "Status",
  "Precondition",
  "Objective",
  "Folder",
  "Priority",
  "Component",
  "Labels",
  "Owner",
  "Estimated Time",
  "Coverage (Issues)",
  "Test Script (Step-by-Step) - Step",
  "Test Script (Step-by-Step) - Test Data",
  "Test Script (Step-by-Step) - Expected Result",
  "Test Script (Plain Text)",
  "Test Script (BDD)",
];

function numbered(items: string[]): string {
  return items.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await requireUser();

  const member = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
    select: { id: true, name: true },
  });
  if (!member) return new Response("Not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    ids?: string[];
    suiteId?: string | null;
    archived?: boolean;
    q?: string;
    format?: "xlsx" | "csv";
  };
  const format = body.format === "csv" ? "csv" : "xlsx";

  // Export the selected ids, or the whole current scope when nothing selected.
  const where =
    body.ids && body.ids.length > 0
      ? { suite: { projectId }, id: { in: body.ids } }
      : await buildCaseWhere(
          projectId,
          { suiteId: body.suiteId ?? undefined, archived: body.archived },
          body.q
        );

  const cases = await prisma.testCase.findMany({
    where,
    include: { suite: true },
    orderBy: [{ suiteId: "asc" }, { sourceKey: "asc" }],
  });

  // Build id -> "/A/B/C" folder path for every suite.
  const suites = await prisma.testSuite.findMany({ where: { projectId } });
  const byId = new Map(suites.map((s) => [s.id, s]));
  const pathOf = (suiteId: string): string => {
    const parts: string[] = [];
    let cur = byId.get(suiteId);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentSuiteId ? byId.get(cur.parentSuiteId) : undefined;
    }
    return "/" + parts.join("/");
  };

  // Union of custom-field keys becomes extra trailing columns.
  const customKeys = new Set<string>();
  for (const c of cases) {
    const cf = (c.customFields ?? {}) as Record<string, unknown>;
    Object.keys(cf).forEach((k) => customKeys.add(k));
  }
  const columns = [...BASE_COLUMNS, ...customKeys];

  const rows = cases.map((c) => {
    const steps = (c.steps as unknown as Step[]) ?? [];
    const cf = (c.customFields ?? {}) as Record<string, unknown>;
    const row: Record<string, string> = {
      Key: c.sourceKey ?? "",
      Name: c.title,
      Status: STATUS_OUT[c.status] ?? c.status,
      Precondition: c.preconditions ?? "",
      Objective: c.objective ?? "",
      Folder: pathOf(c.suiteId),
      Priority: PRIORITY_OUT[c.priority] ?? c.priority,
      Component: c.component ?? "",
      Labels: c.tags.join(", "),
      Owner: c.ownerName ?? "",
      "Estimated Time": c.estimatedTime != null ? String(c.estimatedTime) : "",
      "Coverage (Issues)": c.coverage.join(", "),
      "Test Script (Step-by-Step) - Step":
        c.scriptType === "steps" ? numbered(steps.map((s) => s.action)) : "",
      "Test Script (Step-by-Step) - Test Data":
        c.scriptType === "steps"
          ? numbered(steps.map((s) => s.testData ?? ""))
          : "",
      "Test Script (Step-by-Step) - Expected Result":
        c.scriptType === "steps"
          ? numbered(steps.map((s) => s.expected ?? ""))
          : "",
      "Test Script (Plain Text)":
        c.scriptType === "plain" ? c.scriptBody ?? "" : "",
      "Test Script (BDD)": c.scriptType === "bdd" ? c.scriptBody ?? "" : "",
    };
    for (const k of customKeys) row[k] = String(cf[k] ?? "");
    return row;
  });

  const safeName = member.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const lines = [
      columns.map(csvEscape).join(","),
      ...rows.map((r) => columns.map((col) => csvEscape(r[col] ?? "")).join(",")),
    ];
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-${stamp}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Test Cases");
  ws.columns = columns.map((c) => ({ header: c, key: c, width: 24 }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-${stamp}.xlsx"`,
    },
  });
}
