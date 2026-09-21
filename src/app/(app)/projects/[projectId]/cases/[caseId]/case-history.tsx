"use client";

import { useMemo, useState } from "react";
import {
  diffSnapshots,
  type CaseSnapshot,
  type FieldDiff,
} from "@/lib/case-versions";
import type { CaseVersionRow } from "./case-detail";

const SOURCE_LABEL: Record<CaseVersionRow["source"], string> = {
  manual: "Saved",
  import: "Imported",
  restore: "Restored",
};
const SOURCE_CLS: Record<CaseVersionRow["source"], string> = {
  manual: "bg-surface-muted text-muted",
  import: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  restore: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const CURRENT = "current";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(sec: number | null): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Render one snapshot field value as readable text for the diff view. */
function renderValue(field: keyof CaseSnapshot, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "estimatedTime") return fmtTime(value as number);
  if (field === "steps") {
    const steps = Array.isArray(value) ? value : [];
    if (steps.length === 0) return "—";
    return steps
      .map((s, i) => {
        const step = s as { action?: string; testData?: string; expected?: string };
        const parts = [step.action, step.testData, step.expected]
          .map((p) => (p ?? "").toString().replace(/<[^>]+>/g, " ").trim())
          .filter(Boolean);
        return `${i + 1}. ${parts.join("  ·  ") || "(empty)"}`;
      })
      .join("\n");
  }
  if (field === "tags" || field === "coverage") {
    const arr = Array.isArray(value) ? value : [];
    return arr.length ? arr.join(", ") : "—";
  }
  if (field === "customFields") {
    const obj = (value ?? {}) as Record<string, unknown>;
    const entries = Object.entries(obj).filter(([, v]) => v != null && v !== "");
    return entries.length
      ? entries.map(([k, v]) => `${k}: ${String(v)}`).join("\n")
      : "—";
  }
  // Plain strings — strip any inline HTML for a clean textual comparison.
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "—";
}

export function CaseHistory({
  versions,
  current,
  currentVersionNo,
  canRestore,
  busy,
  message,
  onCreateVersion,
  onRestore,
}: {
  versions: CaseVersionRow[]; // newest first
  current: CaseSnapshot; // live working head
  currentVersionNo: number;
  canRestore: boolean;
  busy: boolean;
  message: string | null;
  onCreateVersion: (note: string) => void;
  onRestore: (versionNo: number) => void;
}) {
  const [note, setNote] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  // Compare selectors: "current" (working head) or a versionNo.
  const latest = versions[0];
  const [left, setLeft] = useState<string>(latest ? String(latest.versionNo) : CURRENT);
  const [right, setRight] = useState<string>(CURRENT);

  const snapshotFor = (key: string): CaseSnapshot =>
    key === CURRENT
      ? current
      : versions.find((v) => String(v.versionNo) === key)?.snapshot ?? current;

  const labelFor = (key: string): string =>
    key === CURRENT ? "Current (working copy)" : `v${key}`;

  const diff: FieldDiff[] = useMemo(
    () => diffSnapshots(snapshotFor(left), snapshotFor(right)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [left, right, versions, current]
  );

  const options = [
    { value: CURRENT, label: "Current (working copy)" },
    ...versions.map((v) => ({ value: String(v.versionNo), label: `v${v.versionNo}` })),
  ];

  return (
    <div className="space-y-6">
      {/* Create new version */}
      <div className="rounded-lg border border-line bg-surface-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for this version…"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg outline-none focus:border-ring"
          />
          <button
            onClick={() => {
              onCreateVersion(note);
              setNote("");
            }}
            disabled={busy}
            className="btn btn-primary shrink-0 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create new version"}
          </button>
        </div>
        <p className="mt-2 text-xs text-subtle">
          Freezes the current content as a new version. Editing the case never
          creates a version on its own — only this button does.
        </p>
        {message && <p className="mt-2 text-xs font-medium text-fg">{message}</p>}
      </div>

      {/* Compare */}
      {versions.length > 0 && (
        <div className="rounded-lg border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-muted/40 px-3 py-2 text-sm">
            <span className="text-muted">Compare</span>
            <select
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg"
            >
              {options.map((o) => (
                <option key={`l-${o.value}`} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-muted">with</span>
            <select
              value={right}
              onChange={(e) => setRight(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg"
            >
              {options.map((o) => (
                <option key={`r-${o.value}`} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {left === right ? (
            <p className="px-3 py-4 text-sm text-subtle">Pick two different versions to compare.</p>
          ) : diff.length === 0 ? (
            <p className="px-3 py-4 text-sm text-subtle">
              No differences between {labelFor(left)} and {labelFor(right)}.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {diff.map((d) => (
                <li key={d.field} className="px-3 py-2.5">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {d.label}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-2 text-xs text-fg dark:border-red-500/30 dark:bg-red-500/10">
                      {renderValue(d.field, d.before)}
                    </pre>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-fg dark:border-emerald-500/30 dark:bg-emerald-500/10">
                      {renderValue(d.field, d.after)}
                    </pre>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Version list */}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="border-b border-line bg-surface-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          Versions
        </div>
        {versions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-subtle">
            No versions yet. Click “Create new version” to save the first one.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.versionNo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-mono font-semibold text-fg">v{v.versionNo}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_CLS[v.source]}`}>
                  {SOURCE_LABEL[v.source]}
                </span>
                {v.versionNo === currentVersionNo && (
                  <span className="rounded bg-ring/15 px-1.5 py-0.5 text-[10px] font-medium text-ring">
                    Current
                  </span>
                )}
                <span className="text-muted">{v.authorName ?? "—"}</span>
                <span className="text-subtle">{fmtDate(v.createdAt)}</span>
                {v.note && <span className="text-subtle">· {v.note}</span>}
                <span className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => { setLeft(String(v.versionNo)); setRight(CURRENT); }}
                    className="text-xs text-muted hover:text-fg hover:underline"
                  >
                    Compare
                  </button>
                  {canRestore && (
                    <button
                      onClick={() => setConfirmRestore(v.versionNo)}
                      disabled={busy}
                      className="text-xs text-ring hover:underline disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Restore confirmation */}
      {confirmRestore != null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmRestore(null)}>
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-fg">Restore v{confirmRestore}?</h3>
            <p className="mt-1.5 text-sm text-muted">
              This copies v{confirmRestore}&apos;s content onto the current test case and
              records it as a new version. Nothing is deleted — you can restore any
              version again later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmRestore(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => {
                  onRestore(confirmRestore);
                  setConfirmRestore(null);
                }}
                className="btn btn-primary"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
