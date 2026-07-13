"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { autosaveCase, deleteCase } from "@/lib/actions/cases";
import { Modal } from "@/components/modal";
import { SelectField, opts, type Opt } from "@/components/select-field";
import { StatusBadge } from "@/components/ui";
import { CUSTOM_FIELDS } from "@/lib/custom-fields";
import type { Step } from "@/lib/validation";
import type { ExecutionStatus } from "@prisma/client";

export type CaseUser = { id: string; name: string | null; email: string };

export type CaseData = {
  id: string;
  key: string | null;
  title: string;
  objective: string | null;
  preconditions: string | null;
  scriptType: "steps" | "plain" | "bdd";
  steps: Step[];
  scriptBody: string | null;
  priority: string;
  status: string;
  component: string | null;
  ownerName: string | null;
  estimatedTime: number | null;
  tags: string[];
  coverage: string[];
  externalRef: string | null;
  customFields: Record<string, string>;
  suiteId: string;
  createdByName: string | null;
  updatedAt: string;
};

const TABS = ["Details", "Test Script", "Traceability", "Execution", "History"] as const;
type Tab = (typeof TABS)[number];

// One row of this case's execution history (across all cycles).
export type CaseExecRow = {
  id: string;
  status: ExecutionStatus;
  executedAt: string | null;
  environment: string | null;
  releaseVersion: string | null;
  defectRef: string | null;
  notes: string | null;
  testerName: string | null;
  cycleId: string;
  cycleKey: string | null;
  cycleName: string;
};

const STATUS_OPTS: Opt[] = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "deprecated", label: "Deprecated" },
];
// Zephyr-style priority labels mapped onto our enum.
const PRIORITY_OPTS: Opt[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Normal" },
  { value: "low", label: "Low" },
];

const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";
// Invisible until hovered/focused (Zephyr click-to-edit feel).
const inlineCls =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-fg transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none placeholder:text-subtle";

function fmtHHMM(sec: number | null): string {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
function parseHHMM(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60;
  const n = Number(t);
  return isFinite(n) ? Math.round(n * 60) : null;
}

function ChipInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1">
      {values.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== t))}
            className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder="Add…"
        className="w-20 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none"
      />
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <div className="flex items-center gap-3 border-b border-line pb-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-semibold text-fg"
        >
          <span className="text-xs text-subtle">{open ? "▾" : "▸"}</span>
          {title}
        </button>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {open && <div className="pt-4">{children}</div>}
    </section>
  );
}

export function CaseDetail({
  projectId,
  initial,
  suiteOptions,
  folderPath,
  users,
  executions,
}: {
  projectId: string;
  initial: CaseData;
  suiteOptions: Opt[];
  folderPath: string;
  users: CaseUser[];
  executions: CaseExecRow[];
}) {
  const [tab, setTab] = useState<Tab>("Details");
  const [c, setC] = useState<CaseData>(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const userOpts: Opt[] = users.map((u) => ({
    value: u.name ?? u.email,
    label: u.name ?? u.email,
  }));

  async function flush() {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaveState("saving");
    await autosaveCase(c.id, patch);
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
  }
  function scheduleSave(partial: Record<string, unknown>) {
    Object.assign(pending.current, partial);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }
  function saveNow(partial: Record<string, unknown>) {
    Object.assign(pending.current, partial);
    if (timer.current) clearTimeout(timer.current);
    flush();
  }
  function edit<K extends keyof CaseData>(key: K, value: CaseData[K], immediate = false) {
    setC((p) => ({ ...p, [key]: value }));
    if (immediate) saveNow({ [key]: value });
    else scheduleSave({ [key]: value });
  }
  function editCustom(key: string, v: string, immediate = false) {
    const next = { ...c.customFields, [key]: v };
    setC((p) => ({ ...p, customFields: next }));
    if (immediate) saveNow({ customFields: next });
    else scheduleSave({ customFields: next });
  }

  function editStep(i: number, patch: Partial<Step>) {
    const next = c.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setC((p) => ({ ...p, steps: next }));
    scheduleSave({ steps: next });
  }
  function addStep() {
    const next = [...c.steps, { action: "", testData: "", expected: "" }];
    setC((p) => ({ ...p, steps: next }));
    saveNow({ steps: next });
  }
  function removeStep(i: number) {
    const next = c.steps.filter((_, idx) => idx !== i);
    setC((p) => ({ ...p, steps: next }));
    saveNow({ steps: next });
  }
  function addStepAt(i: number) {
    const next = [...c.steps];
    next.splice(i + 1, 0, { action: "", testData: "", expected: "" });
    setC((p) => ({ ...p, steps: next }));
    saveNow({ steps: next });
  }
  function duplicateStep(i: number) {
    const next = [...c.steps];
    next.splice(i + 1, 0, { ...c.steps[i] });
    setC((p) => ({ ...p, steps: next }));
    saveNow({ steps: next });
  }
  // Tab from the last field of the last step adds a new step (Zephyr behaviour).
  function onLastStepTab(e: React.KeyboardEvent, i: number) {
    if (e.key !== "Tab" || e.shiftKey || i !== c.steps.length - 1) return;
    e.preventDefault();
    const nextIndex = c.steps.length; // new step's index
    addStep();
    setTimeout(() => {
      const tas = stepsRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea");
      tas?.[nextIndex * 3]?.focus();
    }, 30);
  }

  const priorityOpts =
    PRIORITY_OPTS.some((o) => o.value === c.priority)
      ? PRIORITY_OPTS
      : [...PRIORITY_OPTS, { value: c.priority, label: c.priority }];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/projects/${projectId}`}
              className="text-sm text-subtle transition-colors hover:text-fg"
            >
              ← {folderPath || "Back"}
            </Link>
            {c.key && (
              <p className="mt-1 font-mono text-xs text-subtle">{c.key}</p>
            )}
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">
              {c.title || "Untitled test case"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-1">
            <span className="text-xs text-subtle">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : ""}
            </span>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-red-200 bg-surface px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-4 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-ring text-fg"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {t}
              {t === "Execution" && executions.length > 0 && (
                <span className="ml-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-subtle">
                  {executions.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto py-5">
        {tab === "Details" && (
          <div className="space-y-8">
            <Section title="Description">
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={c.title}
                    onChange={(e) => edit("title", e.target.value)}
                    onBlur={flush}
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Objective</label>
                  <textarea
                    rows={2}
                    value={c.objective ?? ""}
                    onChange={(e) => edit("objective", e.target.value)}
                    onBlur={flush}
                    placeholder="Click to type the objective"
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Precondition</label>
                  <textarea
                    rows={2}
                    value={c.preconditions ?? ""}
                    onChange={(e) => edit("preconditions", e.target.value)}
                    onBlur={flush}
                    placeholder="Click to type the precondition"
                    className={inlineCls}
                  />
                </div>
              </div>
            </Section>

            <Section title="Details">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelCls}>Status</label>
                  <SelectField
                    value={c.status}
                    options={STATUS_OPTS}
                    onChange={(v) => edit("status", v || "draft", true)}
                    allowClear={false}
                  />
                </div>
                <div>
                  <label className={labelCls}>Priority</label>
                  <SelectField
                    value={c.priority}
                    options={priorityOpts}
                    onChange={(v) => edit("priority", v || "medium", true)}
                    allowClear={false}
                  />
                </div>
                <div>
                  <label className={labelCls}>Component</label>
                  <input
                    value={c.component ?? ""}
                    onChange={(e) => edit("component", e.target.value)}
                    onBlur={flush}
                    placeholder="None"
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Owner</label>
                  <SelectField
                    value={c.ownerName ?? ""}
                    options={userOpts}
                    onChange={(v) => edit("ownerName", v || null, true)}
                    placeholder="Unassigned"
                    searchable
                  />
                </div>
                <div>
                  <label className={labelCls}>Estimated run time</label>
                  <input
                    defaultValue={fmtHHMM(c.estimatedTime)}
                    onChange={(e) =>
                      scheduleSave({ estimatedTime: parseHHMM(e.target.value) })
                    }
                    onBlur={flush}
                    placeholder="hhh:mm"
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Folder</label>
                  <SelectField
                    value={c.suiteId}
                    options={suiteOptions}
                    onChange={(v) => v && edit("suiteId", v, true)}
                    allowClear={false}
                    searchable
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className={labelCls}>Labels</label>
                  <ChipInput values={c.tags} onChange={(n) => edit("tags", n, true)} />
                </div>
                <div>
                  <label className={labelCls}>External ref</label>
                  <input
                    value={c.externalRef ?? ""}
                    onChange={(e) => edit("externalRef", e.target.value)}
                    onBlur={flush}
                    placeholder="None"
                    className={inlineCls}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className={labelCls}>Coverage (issues)</label>
                  <ChipInput
                    values={c.coverage}
                    onChange={(n) => edit("coverage", n, true)}
                  />
                </div>
              </div>
            </Section>

            <Section
              title={`Custom Fields (${CUSTOM_FIELDS.length})`}
              right={
                <span className="cursor-default text-xs text-subtle">
                  Manage custom fields
                </span>
              }
            >
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {CUSTOM_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className={labelCls}>{f.key}</label>
                    {f.type === "text" ? (
                      <input
                        value={c.customFields[f.key] ?? ""}
                        onChange={(e) => editCustom(f.key, e.target.value)}
                        onBlur={flush}
                        placeholder="None"
                        className={inlineCls}
                      />
                    ) : f.type === "user" ? (
                      <SelectField
                        value={c.customFields[f.key] ?? ""}
                        options={userOpts}
                        onChange={(v) => editCustom(f.key, v, true)}
                        placeholder="Unassigned"
                        searchable
                      />
                    ) : (
                      <SelectField
                        value={c.customFields[f.key] ?? ""}
                        options={opts(f.options ?? [])}
                        onChange={(v) => editCustom(f.key, v, true)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <p className="pt-2 text-xs text-subtle">
              Created by {c.createdByName ?? "—"} · updated{" "}
              {new Date(c.updatedAt).toLocaleString()}
            </p>
          </div>
        )}

        {tab === "Test Script" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted">Type:</span>
                <div className="w-40">
                  <SelectField
                    value={c.scriptType}
                    options={[
                      { value: "steps", label: "Step by Step" },
                      { value: "plain", label: "Plain Text" },
                      { value: "bdd", label: "BDD / Gherkin" },
                    ]}
                    onChange={(v) =>
                      v && edit("scriptType", v as CaseData["scriptType"], true)
                    }
                    allowClear={false}
                  />
                </div>
              </div>
              <button
                type="button"
                title="Coming soon"
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                ✨ Automate Test
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted">Data type:</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-subtle">
                  None ▾
                </span>
              </div>
            </div>

            {c.scriptType === "steps" ? (
              <div className="space-y-3">
                {/* Steps heading + view toggle */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">
                    Steps ({c.steps.length})
                  </h3>
                  <div className="flex items-center gap-1 text-sm text-subtle">
                    <span
                      className="cursor-default rounded px-1.5 py-0.5 hover:bg-surface-muted"
                      title="List view"
                    >
                      ☰
                    </span>
                    <span
                      className="cursor-default rounded bg-surface-muted px-1.5 py-0.5 text-fg"
                      title="Column view"
                    >
                      ▥
                    </span>
                  </div>
                </div>

                {/* Steps table */}
                <div
                  ref={stepsRef}
                  className="overflow-hidden rounded-lg border border-line"
                >
                  <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2.75rem] border-b border-line bg-surface-muted text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    <span />
                    <span className="px-3 py-2">Step</span>
                    <span className="px-3 py-2">Test data</span>
                    <span className="px-3 py-2">Expected result</span>
                    <span />
                  </div>
                  {c.steps.length === 0 && (
                    <p className="px-4 py-6 text-sm text-subtle">
                      No steps yet — add one below.
                    </p>
                  )}
                  {c.steps.map((s, i) => (
                    <div
                      key={i}
                      className="group grid grid-cols-[3.5rem_1fr_1fr_1fr_2.75rem] border-b border-line last:border-b-0"
                    >
                      <div className="flex items-start justify-center bg-surface-muted pt-3 text-xl font-semibold text-muted">
                        {i + 1}
                      </div>
                      <div className="p-1.5">
                        <textarea
                          rows={4}
                          value={s.action}
                          onChange={(e) => editStep(i, { action: e.target.value })}
                          onBlur={flush}
                          className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none"
                        />
                      </div>
                      <div className="p-1.5">
                        <textarea
                          rows={4}
                          value={s.testData ?? ""}
                          onChange={(e) => editStep(i, { testData: e.target.value })}
                          onBlur={flush}
                          placeholder="None"
                          className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none placeholder:text-subtle"
                        />
                      </div>
                      <div className="p-1.5">
                        <textarea
                          rows={4}
                          value={s.expected ?? ""}
                          onChange={(e) => editStep(i, { expected: e.target.value })}
                          onBlur={flush}
                          onKeyDown={(e) => onLastStepTab(e, i)}
                          className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-2 py-2 text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => addStepAt(i)}
                          title="Add step below"
                          className="hover:text-fg"
                        >
                          ＋
                        </button>
                        <button
                          onClick={() => duplicateStep(i)}
                          title="Duplicate step"
                          className="hover:text-fg"
                        >
                          ⧉
                        </button>
                        <button
                          onClick={() => removeStep(i)}
                          title="Delete step"
                          className="hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => addStep()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
                  >
                    ＋ Add step
                  </button>
                  <button
                    type="button"
                    title="Coming soon"
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
                  >
                    ⦿ Record Steps
                  </button>
                  <span className="ml-auto text-xs text-subtle">
                    Hint: when editing the last step, press{" "}
                    <kbd className="rounded border border-line bg-surface-muted px-1 py-0.5 text-[10px]">
                      Tab
                    </kbd>{" "}
                    to add a new one.
                  </span>
                </div>
              </div>
            ) : (
              <textarea
                rows={14}
                value={c.scriptBody ?? ""}
                onChange={(e) => edit("scriptBody", e.target.value)}
                onBlur={flush}
                placeholder={
                  c.scriptType === "bdd" ? "Given …\nWhen …\nThen …" : "Test script…"
                }
                className="field font-mono text-sm"
              />
            )}
          </div>
        )}

        {tab === "Execution" &&
          (executions.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-subtle">
              This case has not been added to any test cycle yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-semibold">Cycle</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Result</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Tester</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Executed</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Environment</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Version</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Defect</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id} className="border-t border-line align-middle">
                      <td className="max-w-[14rem] whitespace-nowrap px-3 py-1.5">
                        <Link
                          href={`/projects/${projectId}/cycles/${e.cycleKey ?? e.cycleId}`}
                          className="block truncate text-fg hover:text-ring hover:underline"
                          title={e.cycleName}
                        >
                          {e.cycleKey && (
                            <span className="mr-1.5 font-mono text-xs text-subtle">
                              {e.cycleKey}
                            </span>
                          )}
                          {e.cycleName}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {e.testerName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {e.executedAt
                          ? new Date(e.executedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {e.environment ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {e.releaseVersion ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {e.defectRef ?? "—"}
                      </td>
                      <td className="max-w-[16rem] px-3 py-1.5 text-muted">
                        <span className="block truncate" title={e.notes ?? undefined}>
                          {e.notes ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {(tab === "Traceability" || tab === "History") && (
          <div className="flex h-full items-center justify-center py-16 text-sm text-subtle">
            {tab} — coming in a later phase.
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete test case"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Delete{" "}
            <span className="font-medium text-fg">
              {c.key ? `${c.key} · ` : ""}
              {c.title || "this test case"}
            </span>
            ? This permanently removes the test case and can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
            >
              Cancel
            </button>
            <form action={deleteCase}>
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete test case
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
