/**
 * Pure helpers for the test-cycle History (field-change audit log). Computes
 * the per-field before→after rows the History tab shows, with values already
 * formatted for display so the UI just renders strings.
 */

import type { CycleStatus } from "@prisma/client";

/** Display labels for the cycle's scalar fields. */
export const CYCLE_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  environment: "Environment",
  version: "Version",
  iteration: "Iteration",
  ownerName: "Owner",
  status: "Status",
  startDate: "Planned Start Date",
  endDate: "Planned End Date",
  folderId: "Folder",
};

// Order the scalar fields are checked/displayed in.
const SCALAR_FIELDS = [
  "name",
  "description",
  "environment",
  "version",
  "iteration",
  "ownerName",
  "status",
  "startDate",
  "endDate",
  "folderId",
] as const;

const STATUS_LABELS: Record<CycleStatus, string> = {
  not_executed: "Not executed",
  in_progress: "In progress",
  done: "Done",
};

export function cycleStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return STATUS_LABELS[status as CycleStatus] ?? status;
}

/** dd/MM/yyyy (matches the cycle Details date fields), or "" for no date. */
export function fmtCycleDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

export type CycleFieldValues = {
  name?: string | null;
  description?: string | null;
  environment?: string | null;
  version?: string | null;
  iteration?: string | null;
  ownerName?: string | null;
  status?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  folderId?: string | null;
  customFields?: Record<string, unknown> | null;
};

export type CycleChangeRow = {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
};

function displayScalar(field: string, value: unknown): string {
  if (value == null || value === "") return "";
  if (field === "status") return cycleStatusLabel(String(value));
  if (field === "startDate" || field === "endDate") {
    return fmtCycleDate(value as Date | string);
  }
  return String(value);
}

/**
 * Diff the cycle fields present in `after` (the patch being applied) against
 * `before`, returning one row per field that actually changed. `folderPath`
 * turns a folder id into its display path (e.g. "/Manual/iOS/en/regression").
 */
export function computeCycleChanges(
  before: CycleFieldValues,
  after: CycleFieldValues,
  folderPath: (id: string | null | undefined) => string
): CycleChangeRow[] {
  const rows: CycleChangeRow[] = [];

  for (const field of SCALAR_FIELDS) {
    if (!(field in after)) continue;
    let oldStr: string;
    let newStr: string;
    if (field === "folderId") {
      oldStr = folderPath(before.folderId);
      newStr = folderPath(after.folderId);
    } else {
      oldStr = displayScalar(field, before[field as keyof CycleFieldValues]);
      newStr = displayScalar(field, after[field as keyof CycleFieldValues]);
    }
    if (oldStr !== newStr) {
      rows.push({
        field,
        label: CYCLE_FIELD_LABELS[field],
        oldValue: oldStr || null,
        newValue: newStr || null,
      });
    }
  }

  if ("customFields" in after) {
    const oldCf = (before.customFields ?? {}) as Record<string, unknown>;
    const newCf = (after.customFields ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(oldCf), ...Object.keys(newCf)]);
    for (const k of keys) {
      const oldStr = oldCf[k] == null ? "" : String(oldCf[k]);
      const newStr = newCf[k] == null ? "" : String(newCf[k]);
      if (oldStr !== newStr) {
        rows.push({
          field: `cf:${k}`,
          label: k,
          oldValue: oldStr || null,
          newValue: newStr || null,
        });
      }
    }
  }

  return rows;
}
