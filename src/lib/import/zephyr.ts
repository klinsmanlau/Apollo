import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { Step } from "@/lib/validation";
import {
  KNOWN_HEADERS,
  HEADER_ALIASES,
  CUSTOM_FIELD,
  IGNORE_FIELD,
} from "./fields";

export type ParsedCase = {
  sourceKey: string | null;
  title: string;
  objective: string | null;
  preconditions: string | null;
  folderPath: string[];
  priority: "low" | "medium" | "high";
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

export const PRIORITY_MAP: Record<string, ParsedCase["priority"]> = {
  low: "low",
  normal: "medium",
  medium: "medium",
  high: "high",
  // Apollo has no "critical" tier — Zephyr Critical/Highest fold into High.
  critical: "high",
  highest: "high",
};

export const STATUS_MAP: Record<string, ParsedCase["status"]> = {
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

// Load the first worksheet from an xlsx buffer or a CSV buffer. ExcelJS reads
// CSV via fast-csv, which handles quoted, multi-line step cells — so the row
// mapping downstream is identical for both formats.
async function loadWorksheet(
  data: ArrayBuffer | Buffer,
  csv?: boolean
): Promise<ExcelJS.Worksheet | undefined> {
  const wb = new ExcelJS.Workbook();
  if (csv) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    return wb.csv.read(Readable.from(buf));
  }
  await wb.xlsx.load(data as ArrayBuffer);
  return wb.worksheets[0];
}

/**
 * Read just the header names + a few sample rows for the import "Field mapping"
 * step, without persisting anything. `rowCount` is the number of data rows.
 */
export async function readWorkbookHeaders(
  data: ArrayBuffer | Buffer,
  opts: { csv?: boolean; sampleSize?: number } = {}
): Promise<{ headers: string[]; sampleRows: string[][]; rowCount: number }> {
  const ws = await loadWorksheet(data, opts.csv);
  if (!ws) return { headers: [], sampleRows: [], rowCount: 0 };
  const headers: string[] = [];
  const cols: number[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    const name = cellText(cell.value);
    if (!name) return;
    headers.push(name);
    cols.push(col);
  });
  const sampleSize = opts.sampleSize ?? 5;
  const sampleRows: string[][] = [];
  let dataRows = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    dataRows++;
    if (sampleRows.length < sampleSize)
      sampleRows.push(cols.map((c) => cellText(row.getCell(c).value)));
  }
  return { headers, sampleRows, rowCount: dataRows };
}

export async function parseZephyrWorkbook(
  data: ArrayBuffer | Buffer,
  opts: { csv?: boolean; mapping?: Record<string, string> } = {}
): Promise<ParseResult> {
  const ws = await loadWorksheet(data, opts.csv);
  if (!ws) return { cases: [], skipped: 0, unmappedHeaders: [] };

  // Decide each column's target field. An explicit user mapping (from the
  // import "Field mapping" step) wins; otherwise auto-detect via canonical
  // names + aliases. Real fields go in `colOf`; anything sent to "custom" (or
  // unrecognized when auto-detecting) is preserved in `customCols` → the case's
  // custom-fields bag; "ignore" is dropped.
  const colOf: Record<string, number> = {};
  const customCols: { col: number; header: string }[] = [];
  const unmapped: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    const name = cellText(cell.value);
    if (!name) return;
    const target = opts.mapping
      ? opts.mapping[name] ?? CUSTOM_FIELD
      : HEADER_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
    if (target === IGNORE_FIELD) return;
    if (target === CUSTOM_FIELD || (!opts.mapping && !KNOWN_HEADERS.has(target))) {
      customCols.push({ col, header: name });
      unmapped.push(name);
      return;
    }
    colOf[target] = col;
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

    // Columns mapped to "custom field" (or unrecognized when auto-detecting)
    // → lossless bag, keyed by the original header.
    const customFields: Record<string, string> = {};
    for (const { col, header } of customCols) {
      const val = cellText(row.getCell(col).value);
      if (val) customFields[header] = val;
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
