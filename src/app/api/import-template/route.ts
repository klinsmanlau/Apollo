import ExcelJS from "exceljs";

// Node runtime — ExcelJS needs it.
export const runtime = "nodejs";

/**
 * Downloadable "author a test case" template for team members.
 *
 * Columns are the human-friendly names the importer understands:
 * "Precondition" is a canonical Zephyr header; "Step", "Test Data",
 * "Expected Result" and "Coverage" map via the header aliases in
 * src/lib/import/zephyr.ts. Keep this list in sync with those aliases so a
 * filled-in template always round-trips through the importer.
 *
 * GET /api/import-template?format=xlsx|csv  (defaults to xlsx)
 */
const COLUMNS = [
  "Key",
  "Name",
  "Folder",
  "Priority",
  "Status",
  "Precondition",
  "Step",
  "Test Data",
  "Expected Result",
  "Labels",
  "Coverage",
  "Owner",
  "Objective",
] as const;

const EXAMPLE: Record<(typeof COLUMNS)[number], string> = {
  Key: "",
  Name: "Verify user can log in with valid credentials",
  Folder: "Authentication/Login",
  Priority: "High",
  Status: "Draft",
  Precondition: "A registered, active user account exists.",
  Step: '1. Open the login page.\n2. Enter a valid email and password.\n3. Click "Sign in".',
  "Test Data": "email: test@ryt.my\npassword: Passw0rd!",
  "Expected Result":
    "1. The login page loads.\n2. Credentials are accepted.\n3. The dashboard is shown.",
  Labels: "smoke, auth",
  Coverage: "TS-101",
  Owner: "",
  Objective: "Confirm the happy-path login works.",
};

const INSTRUCTIONS: [string, string][] = [
  ["Name", "Required. One row = one test case. Rows without a Name are skipped."],
  [
    "Key",
    "Leave blank for new cases (Apollo assigns one). Keep the same Zephyr Key to UPDATE an existing case on re-import; without a Key every import creates new cases.",
  ],
  [
    "Folder",
    'Use "/" for nested folders, e.g. Rewards/Backoffice/Campaigns. Missing folders are created automatically.',
  ],
  ["Priority", "High, Normal, or Low."],
  ["Status", "Draft, Approved, or Deprecated."],
  [
    "Step / Expected Result",
    'Number each line ("1. ...", "2. ..."). Step line 1 pairs with Expected Result line 1, and so on.',
  ],
  ["Test Data", "Optional. Number it the same way as Step if used."],
  ["Labels / Coverage", "Comma-separated, e.g. smoke, auth."],
  [
    "Other columns",
    "Any column not listed here is kept on the case as a custom field — safe to add your own.",
  ],
];

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: Request) {
  const format =
    new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

  if (format === "csv") {
    const lines = [
      COLUMNS.join(","),
      COLUMNS.map((c) => csvEscape(EXAMPLE[c])).join(","),
    ];
    // Leading BOM so Excel opens UTF-8 correctly.
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="apollo-test-case-template.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Test Cases");
  ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: 26 }));
  ws.getRow(1).font = { bold: true };
  const ex = ws.addRow(EXAMPLE as Record<string, string>);
  ex.alignment = { vertical: "top", wrapText: true };

  const help = wb.addWorksheet("How to fill this in");
  help.columns = [
    { header: "Column", key: "c", width: 22 },
    { header: "What to enter", key: "d", width: 95 },
  ];
  help.getRow(1).font = { bold: true };
  INSTRUCTIONS.forEach(([c, d]) => {
    const r = help.addRow({ c, d });
    r.alignment = { vertical: "top", wrapText: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="apollo-test-case-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
