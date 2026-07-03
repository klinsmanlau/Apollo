import ExcelJS from "exceljs";
import type { Step } from "@/lib/validation";

export type ParsedCase = {
  sourceKey: string | null;
  title: string;
  objective: string | null;
  preconditions: string | null;
  folderPath: string[];
  priority: "low" | "medium" | "high" | "critical";
  status: "draft" | "approved" | "deprecated";
  component: string | null;
  ownerName: string | null;
  estimatedTime: number | null;
  tags: string[];
  coverage: string[];
  scriptType: "steps" | "plain" | "bdd";
  steps: Step[];
  scriptBody: string | null;
  customFields: Record<string, string>;
};

export type ParseResult = {
  cases: ParsedCase[];
  skipped: number; // rows without a title
  unmappedHeaders: string[];
};

// Canonical Zephyr Scale headers we understand (normalized, lowercased).
const KNOWN_HEADERS = new Set(
  [
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
  ].map((h) => h.toLowerCase())
);

const PRIORITY_MAP: Record<string, ParsedCase["priority"]> = {
  low: "low",
  normal: "medium",
  medium: "medium",
  high: "high",
  critical: "critical",
  highest: "critical",
};

const STATUS_MAP: Record<string, ParsedCase["status"]> = {
  draft: "draft",
  approved: "approved",
  deprecated: "deprecated",
};

/** Coerce any ExcelJS cell value to a plain trimmed string. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v && Array.isArray(v.richText))
      return v.richText.map((r: { text: string }) => r.text).join("").trim();
    if ("hyperlink" in v && typeof v.hyperlink === "string")
      return v.hyperlink.trim();
  }
  return String(value).trim();
}

/**
 * Split a Zephyr step cell into individual step lines. Zephyr packs all steps
 * into one cell, numbered ("1. …\n2. …"). We split on a newline that precedes
 * a "N." or "N)" marker, then strip that marker. Falls back to raw newlines.
 */
function splitNumbered(text: string): string[] {
  if (!text.trim()) return [];
  const hasNumbering = /(^|\n)\s*\d+[.)]\s/.test(text);
  const parts = hasNumbering
    ? text.split(/\n(?=\s*\d+[.)]\s)/)
    : text.split(/\n+/);
  return parts
    .map((p) => p.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((p) => p.length > 0);
}

function splitList(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function parseZephyrWorkbook(
  data: ArrayBuffer | Buffer
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { cases: [], skipped: 0, unmappedHeaders: [] };

  // Build header -> column index (1-based) from the first row.
  const headerRow = ws.getRow(1);
  const colOf: Record<string, number> = {};
  const unmapped: string[] = [];
  headerRow.eachCell((cell, col) => {
    const name = cellText(cell.value);
    if (!name) return;
    const norm = name.toLowerCase();
    colOf[norm] = col;
    if (!KNOWN_HEADERS.has(norm)) unmapped.push(name);
  });

  const get = (row: ExcelJS.Row, header: string): string => {
    const col = colOf[header.toLowerCase()];
    return col ? cellText(row.getCell(col).value) : "";
  };

  const cases: ParsedCase[] = [];
  let skipped = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const title = get(row, "Name");
    if (!title) {
      // Blank/continuation row — skip.
      if (row.hasValues) skipped++;
      continue;
    }

    const bdd = get(row, "Test Script (BDD)");
    const plain = get(row, "Test Script (Plain Text)");
    const stepText = get(row, "Test Script (Step-by-Step) - Step");
    const dataText = get(row, "Test Script (Step-by-Step) - Test Data");
    const expText = get(row, "Test Script (Step-by-Step) - Expected Result");

    let scriptType: ParsedCase["scriptType"] = "steps";
    let scriptBody: string | null = null;
    let steps: Step[] = [];
    if (bdd) {
      scriptType = "bdd";
      scriptBody = bdd;
    } else if (plain) {
      scriptType = "plain";
      scriptBody = plain;
    } else {
      const actions = splitNumbered(stepText);
      const datas = splitNumbered(dataText);
      const expecteds = splitNumbered(expText);
      const n = Math.max(actions.length, datas.length, expecteds.length);
      steps = Array.from({ length: n }, (_, i) => ({
        action: actions[i] ?? "",
        testData: datas[i] ?? "",
        expected: expecteds[i] ?? "",
      })).filter((s) => s.action || s.testData || s.expected);
    }

    const estRaw = get(row, "Estimated Time");
    const estimatedTime = estRaw ? parseInt(estRaw, 10) : NaN;

    // Long-tail custom fields → lossless bag.
    const customFields: Record<string, string> = {};
    for (const [norm, col] of Object.entries(colOf)) {
      if (KNOWN_HEADERS.has(norm)) continue;
      const val = cellText(row.getCell(col).value);
      if (val) {
        const original = cellText(headerRow.getCell(col).value);
        customFields[original] = val;
      }
    }

    cases.push({
      sourceKey: get(row, "Key") || null,
      title,
      objective: get(row, "Objective") || null,
      preconditions: get(row, "Precondition") || null,
      folderPath: get(row, "Folder")
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean),
      priority: PRIORITY_MAP[get(row, "Priority").toLowerCase()] ?? "medium",
      status: STATUS_MAP[get(row, "Status").toLowerCase()] ?? "draft",
      component: get(row, "Component") || null,
      ownerName: get(row, "Owner") || null,
      estimatedTime: Number.isFinite(estimatedTime) ? estimatedTime : null,
      tags: splitList(get(row, "Labels")),
      coverage: splitList(get(row, "Coverage (Issues)")),
      scriptType,
      steps,
      scriptBody,
      customFields,
    });
  }

  return { cases, skipped, unmappedHeaders: [...new Set(unmapped)] };
}
