// Column-mapping vocabulary shared by the server-side parser (zephyr.ts) and
// the client import UI. Intentionally free of Node/ExcelJS imports so it is
// safe to pull into client components.

export const CUSTOM_FIELD = "__custom__";
export const IGNORE_FIELD = "__ignore__";

// Canonical Zephyr Scale headers we understand (normalized, lowercased). These
// double as the internal target ids the parser reads (see `get()` in zephyr.ts).
export const KNOWN_HEADERS = new Set(
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

// Some Zephyr exports — and hand-built CSV templates the team uses — label
// columns with shorter or pluralized names than the canonical headers. Map
// those aliases (lowercased) onto the canonical header for auto-detection.
export const HEADER_ALIASES: Record<string, string> = {
  preconditions: "precondition",
  step: "test script (step-by-step) - step",
  steps: "test script (step-by-step) - step",
  "test data": "test script (step-by-step) - test data",
  "expected result": "test script (step-by-step) - expected result",
  "expected results": "test script (step-by-step) - expected result",
  expected: "test script (step-by-step) - expected result",
  coverage: "coverage (issues)",
};

// The Apollo fields a spreadsheet column can map to, shown in the import
// "Field mapping" step. `value` is the internal target the parser reads;
// `label` is what the user sees. Two specials: store the column in the case's
// custom-fields bag, or ignore it entirely.
export type ImportField = { value: string; label: string; required?: boolean };
export const IMPORT_FIELDS: ImportField[] = [
  { value: "name", label: "Name", required: true },
  { value: "key", label: "Key" },
  { value: "folder", label: "Folder" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "precondition", label: "Precondition" },
  { value: "objective", label: "Objective" },
  { value: "component", label: "Component" },
  { value: "owner", label: "Owner" },
  { value: "estimated time", label: "Estimated Time" },
  { value: "labels", label: "Labels" },
  { value: "coverage (issues)", label: "Coverage" },
  { value: "test script (step-by-step) - step", label: "Step" },
  { value: "test script (step-by-step) - test data", label: "Test Data" },
  { value: "test script (step-by-step) - expected result", label: "Expected Result" },
  { value: "test script (plain text)", label: "Test Script (Plain Text)" },
  { value: "test script (bdd)", label: "Test Script (BDD)" },
  { value: CUSTOM_FIELD, label: "Custom field" },
  { value: IGNORE_FIELD, label: "Ignore this column" },
];

// Best-guess mapping for a set of headers using the canonical names + aliases.
// Unknown columns default to "custom field" so nothing is silently dropped.
export function suggestMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const norm = h.toLowerCase();
    const canonical = HEADER_ALIASES[norm] ?? norm;
    out[h] = KNOWN_HEADERS.has(canonical) ? canonical : CUSTOM_FIELD;
  }
  return out;
}
