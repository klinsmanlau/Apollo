import type { Prisma } from "@prisma/client";
import { CUSTOM_FIELDS } from "@/lib/custom-fields";

// A filter criterion targets one field and holds the selected value(s).
// For "enum"/"select"/"tags" fields, `values` is the OR-set (case matches if it
// has ANY of them). For "text" fields, `values[0]` is a case-insensitive
// substring. Multiple criteria (different fields) are AND-ed together.
export type CaseFilter = { field: string; values: string[] };

export type FilterFieldKind = "enum" | "text" | "tags";

export type FilterFieldDef = {
  key: string; // stable id used in the criterion + URL
  label: string; // shown in the picker
  kind: FilterFieldKind;
  group: "Details" | "Custom fields";
  options?: string[]; // for enum: selectable values
  custom?: boolean; // true → lives in the customFields JSON under `jsonKey`
  jsonKey?: string; // the customFields object key (custom fields only)
};

// Built-in test-case detail fields (map to real columns).
const DETAIL_FIELDS: FilterFieldDef[] = [
  { key: "status", label: "Status", kind: "enum", group: "Details", options: ["draft", "approved", "deprecated"] },
  { key: "priority", label: "Priority", kind: "enum", group: "Details", options: ["low", "medium", "high"] },
  { key: "type", label: "Type", kind: "enum", group: "Details", options: ["functional", "regression", "smoke", "integration", "performance", "security", "usability"] },
  { key: "component", label: "Component", kind: "text", group: "Details" },
  { key: "ownerName", label: "Owner", kind: "text", group: "Details" },
  { key: "tags", label: "Labels", kind: "tags", group: "Details" },
];

// Custom fields (stored in the customFields JSON), derived from config.
const CUSTOM_FILTER_FIELDS: FilterFieldDef[] = CUSTOM_FIELDS.map((cf) => ({
  key: `cf:${cf.key}`,
  label: cf.key,
  kind: cf.type === "select" ? "enum" : "text",
  group: "Custom fields",
  options: cf.type === "select" ? cf.options : undefined,
  custom: true,
  jsonKey: cf.key,
}));

export const FILTER_FIELDS: FilterFieldDef[] = [...DETAIL_FIELDS, ...CUSTOM_FILTER_FIELDS];

const FIELD_BY_KEY = new Map(FILTER_FIELDS.map((f) => [f.key, f]));

export function filterFieldByKey(key: string): FilterFieldDef | undefined {
  return FIELD_BY_KEY.get(key);
}

/** Coerce arbitrary parsed JSON into a clean CaseFilter[] (drops unknowns). */
export function normalizeFilters(input: unknown): CaseFilter[] {
  if (!Array.isArray(input)) return [];
  const out: CaseFilter[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const field = (raw as { field?: unknown }).field;
    const values = (raw as { values?: unknown }).values;
    if (typeof field !== "string" || !FIELD_BY_KEY.has(field)) continue;
    if (!Array.isArray(values)) continue;
    const clean = values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    if (clean.length === 0) continue;
    out.push({ field, values: clean });
  }
  return out;
}

/** One field's Prisma predicate, or null if the criterion is empty/unknown. */
function predicateFor(f: CaseFilter): Prisma.TestCaseWhereInput | null {
  const def = FIELD_BY_KEY.get(f.field);
  if (!def || f.values.length === 0) return null;

  if (def.custom && def.jsonKey) {
    if (def.kind === "text") {
      // JSON string_contains (case-sensitive in Prisma; acceptable for notes).
      return { customFields: { path: [def.jsonKey], string_contains: f.values[0] } };
    }
    // Multi-value select: OR of exact JSON equals on the same path.
    return {
      OR: f.values.map((v) => ({
        customFields: { path: [def.jsonKey!], equals: v },
      })),
    };
  }

  switch (def.kind) {
    case "text":
      return { [def.key]: { contains: f.values[0], mode: "insensitive" } } as Prisma.TestCaseWhereInput;
    case "tags":
      return { tags: { hasSome: f.values } };
    case "enum":
      // Enum columns: IN the selected values.
      return { [def.key]: { in: f.values } } as Prisma.TestCaseWhereInput;
    default:
      return null;
  }
}

/** AND together every criterion into a where-clause fragment (or undefined). */
export function buildFilterWhere(
  filters: CaseFilter[]
): Prisma.TestCaseWhereInput | undefined {
  const parts = filters.map(predicateFor).filter((p): p is Prisma.TestCaseWhereInput => p !== null);
  if (parts.length === 0) return undefined;
  return { AND: parts };
}
