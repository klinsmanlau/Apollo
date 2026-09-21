/**
 * Test-case version snapshots — the pure, framework-free core shared by the
 * server actions that write versions, the backfill script, and the History UI.
 *
 * A snapshot captures only a case's *authored content* (title, steps, priority,
 * …). It deliberately excludes identity (key, sourceKey), location (suiteId),
 * and lifecycle (archived) columns: those aren't "content the user versions",
 * and keeping them out means restoring a version can't move or re-key a case.
 */

import type { Step } from "@/lib/validation";

/** Authored fields captured in a version snapshot, in a fixed order. */
export const CASE_AUTHORED_FIELDS = [
  "title",
  "objective",
  "preconditions",
  "scriptType",
  "steps",
  "scriptBody",
  "expectedResult",
  "priority",
  "type",
  "status",
  "component",
  "ownerName",
  "estimatedTime",
  "tags",
  "coverage",
  "externalRef",
  "customFields",
] as const;

export type CaseSnapshot = {
  title: string;
  objective: string | null;
  preconditions: string | null;
  scriptType: string;
  steps: Step[];
  scriptBody: string | null;
  expectedResult: string | null;
  priority: string;
  type: string;
  status: string;
  component: string | null;
  ownerName: string | null;
  estimatedTime: number | null;
  tags: string[];
  coverage: string[];
  externalRef: string | null;
  customFields: Record<string, unknown>;
};

/** Human labels for the diff view. */
export const CASE_FIELD_LABELS: Record<keyof CaseSnapshot, string> = {
  title: "Title",
  objective: "Objective",
  preconditions: "Preconditions",
  scriptType: "Script type",
  steps: "Test steps",
  scriptBody: "Script body",
  expectedResult: "Expected result",
  priority: "Priority",
  type: "Type",
  status: "Status",
  component: "Component",
  ownerName: "Owner",
  estimatedTime: "Estimated time",
  tags: "Tags",
  coverage: "Coverage",
  externalRef: "External reference",
  customFields: "Custom fields",
};

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function nullableStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/**
 * Build a normalized snapshot from any case-shaped source (a Prisma TestCase,
 * the detail page's CaseData, or a stored snapshot). Missing fields become
 * their empty defaults so two sources compare equal when their content matches.
 */
export function buildSnapshot(src: Raw): CaseSnapshot {
  return {
    title: str(src.title),
    objective: nullableStr(src.objective),
    preconditions: nullableStr(src.preconditions),
    scriptType: src.scriptType ? String(src.scriptType) : "steps",
    steps: Array.isArray(src.steps) ? (src.steps as Step[]) : [],
    scriptBody: nullableStr(src.scriptBody),
    expectedResult: nullableStr(src.expectedResult),
    priority: src.priority ? String(src.priority) : "medium",
    type: src.type ? String(src.type) : "functional",
    status: src.status ? String(src.status) : "draft",
    component: nullableStr(src.component),
    ownerName: nullableStr(src.ownerName),
    estimatedTime:
      src.estimatedTime == null || src.estimatedTime === ""
        ? null
        : Number(src.estimatedTime),
    tags: strArray(src.tags),
    coverage: strArray(src.coverage),
    externalRef: nullableStr(src.externalRef),
    customFields:
      src.customFields && typeof src.customFields === "object"
        ? (src.customFields as Record<string, unknown>)
        : {},
  };
}

/** Deterministic JSON with recursively sorted object keys, for equality/diff. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** True when two snapshots have identical authored content. */
export function snapshotsEqual(a: Raw, b: Raw): boolean {
  const sa = buildSnapshot(a);
  const sb = buildSnapshot(b);
  return CASE_AUTHORED_FIELDS.every(
    (f) => stableStringify(sa[f]) === stableStringify(sb[f])
  );
}

export type FieldDiff = {
  field: keyof CaseSnapshot;
  label: string;
  before: unknown;
  after: unknown;
};

/** Fields whose content differs between two snapshots (before → after). */
export function diffSnapshots(before: Raw, after: Raw): FieldDiff[] {
  const a = buildSnapshot(before);
  const b = buildSnapshot(after);
  const out: FieldDiff[] = [];
  for (const f of CASE_AUTHORED_FIELDS) {
    if (stableStringify(a[f]) !== stableStringify(b[f])) {
      out.push({ field: f, label: CASE_FIELD_LABELS[f], before: a[f], after: b[f] });
    }
  }
  return out;
}
