"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PriorityBadge } from "@/components/ui";
import { SelectField, type Opt } from "@/components/select-field";
import { recordExecution } from "@/lib/actions/cycles";
import { EXEC_STATUS_META, execMeta } from "@/lib/exec-status";
import type { Priority, ExecutionStatus } from "@prisma/client";
import type { Step } from "@/lib/validation";

type StepResult = { status: string };

export type PlayerExec = {
  id: string;
  status: ExecutionStatus;
  notes: string | null;
  defectRef: string | null;
  stepResults: StepResult[];
  environment: string | null;
  iteration: string | null;
  releaseVersion: string | null;
  assignedToName: string | null;
  actualTime: number | null;
  executedByName: string | null;
  caseId: string;
  caseKey: string | null;
  caseTitle: string;
  casePriority: Priority;
  caseComponent: string | null;
  caseFolder: string | null;
  caseObjective: string | null;
  casePreconditions: string | null;
  caseSteps: Step[];
  caseEstimatedTime: number | null;
};

type GroupBy = "none" | "status" | "tester" | "environment" | "priority" | "component" | "folder";
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "No group" },
  { value: "status", label: "Status" },
  { value: "tester", label: "Tester" },
  { value: "environment", label: "Environment" },
  { value: "priority", label: "Priority" },
  { value: "component", label: "Component" },
  { value: "folder", label: "Folder" },
];

export type PlayerData = {
  cycle: { id: string; key: string | null; name: string; startDate: string; endDate: string };
  users: { id: string; name: string | null; email: string }[];
  executions: PlayerExec[];
};

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];
const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function fmt(sec: number | null): string {
  const s = sec ?? 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function fmtEst(sec: number | null): string {
  if (sec == null) return "hhh:mm";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function deriveStatus(steps: Step[], results: StepResult[]): ExecutionStatus {
  if (steps.length === 0) return "not_executed";
  const st = steps.map((_, i) => results[i]?.status || "");
  if (st.some((s) => s === "fail")) return "fail";
  if (st.some((s) => s === "blocked")) return "blocked";
  const marked = st.filter(Boolean).length;
  if (marked === 0) return "not_executed";
  if (marked === steps.length && st.every((s) => s === "pass")) return "pass";
  return "in_progress";
}

function Section({
  title,
  right,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
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

function StatusDropdown({
  value,
  onChange,
}: {
  value: ExecutionStatus;
  onChange: (s: ExecutionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = execMeta(value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${cur.pill}`}
      >
        {cur.label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-xl">
            {EXEC_STATUS_META.map((s) => {
              const selected = s.value === value;
              return (
                <button
                  key={s.value}
                  onClick={() => {
                    onChange(s.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "border-ring bg-ring/10 font-medium text-ring"
                      : "border-transparent text-fg hover:bg-surface-muted"
                  }`}
                >
                  <span className={`h-4 w-4 shrink-0 rounded-sm ${s.swatch}`} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const inlineCls =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-fg transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none placeholder:text-subtle";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export function TestPlayer({
  projectId,
  cycleKey,
  data,
  currentUserName,
}: {
  projectId: string;
  cycleKey: string;
  data: PlayerData;
  currentUserName: string;
}) {
  const [execs, setExecs] = useState<PlayerExec[]>(data.executions);
  const [idx, setIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");
  const [groupOpen, setGroupOpen] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [setBelowFor, setSetBelowFor] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(data.executions[0]?.actualTime ?? 0);
  const cur = execs[idx];

  const userOpts: Opt[] = data.users.map((u) => ({
    value: u.name ?? u.email,
    label: u.name ?? u.email,
  }));

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  function patchExec(id: string, patch: Partial<PlayerExec>) {
    setExecs((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    recordExecution(id, patch as Parameters<typeof recordExecution>[1]);
  }

  function goTo(newIdx: number) {
    if (running && cur) {
      setRunning(false);
      patchExec(cur.id, { actualTime: elapsed });
    }
    setIdx(newIdx);
    setElapsed(execs[newIdx]?.actualTime ?? 0);
  }
  function toggleTimer() {
    if (!cur) return;
    if (running) {
      setRunning(false);
      patchExec(cur.id, { actualTime: elapsed });
    } else {
      setRunning(true);
    }
  }

  function setStep(execId: string, stepIndex: number, status: string) {
    const e = execs.find((x) => x.id === execId)!;
    const results = [...(e.stepResults ?? [])];
    while (results.length < e.caseSteps.length) results.push({ status: "" });
    results[stepIndex] = {
      status: results[stepIndex]?.status === status ? "" : status,
    };
    patchExec(execId, {
      stepResults: results,
      status: deriveStatus(e.caseSteps, results),
    });
  }

  const assignedCount = useMemo(
    () => execs.filter((e) => e.assignedToName === currentUserName).length,
    [execs, currentUserName]
  );
  const flat = useMemo(
    () =>
      execs.filter((e) => {
        const q = search.trim().toLowerCase();
        const okSearch =
          !q ||
          e.caseTitle.toLowerCase().includes(q) ||
          (e.caseKey ?? "").toLowerCase().includes(q);
        const okMine = !assignedToMe || e.assignedToName === currentUserName;
        return okSearch && okMine;
      }),
    [execs, search, assignedToMe, currentUserName]
  );

  const groups = useMemo(() => {
    const keyOf = (e: PlayerExec): string => {
      switch (groupBy) {
        case "status": return e.status;
        case "tester": return e.assignedToName || "Unassigned";
        case "environment": return e.environment || "None";
        case "priority": return e.casePriority;
        case "component": return e.caseComponent || "None";
        case "folder": return e.caseFolder || "None";
        default: return "";
      }
    };
    const labelOf = (key: string): string => {
      if (groupBy === "status") return execMeta(key as ExecutionStatus).label;
      if (groupBy === "priority") return PRIORITY_LABEL[key as Priority];
      return key;
    };
    if (groupBy === "none") return [{ key: "", label: "", items: flat }];
    const map = new Map<string, PlayerExec[]>();
    for (const e of flat) {
      const k = keyOf(e);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    let keys = [...map.keys()];
    if (groupBy === "status") keys = EXEC_STATUS_META.map((m) => m.value).filter((k) => map.has(k));
    else if (groupBy === "priority") keys = PRIORITY_ORDER.filter((k) => map.has(k));
    else keys.sort((a, b) => a.localeCompare(b));
    return keys.map((k) => ({ key: k, label: labelOf(k), items: map.get(k)! }));
  }, [flat, groupBy]);

  function setAllBelow(execId: string, status: ExecutionStatus) {
    const pos = flat.findIndex((e) => e.id === execId);
    if (pos < 0) return;
    const ids = flat.slice(pos).map((e) => e.id);
    setExecs((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, status } : e)));
    ids.forEach((id) => recordExecution(id, { status }));
    setSetBelowFor(null);
  }

  const flagColor: Record<Priority, string> = {
    critical: "text-red-600",
    high: "text-red-500",
    medium: "text-amber-500",
    low: "text-gray-400",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href={`/projects/${projectId}/cycles/${cycleKey}`}
              className="text-sm text-subtle transition-colors hover:text-fg"
            >
              ← {data.cycle.name} · Test Player
            </Link>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold tracking-tight text-fg">
              ▶ {data.cycle.name}
            </h1>
            <p className="mt-1 text-xs text-muted">
              Planned: {data.cycle.startDate || "—"} → {data.cycle.endDate || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Body: left rail + execution panel */}
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left rail */}
        <aside className="card flex min-h-0 flex-col p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">
              Test Cases <span className="text-subtle">{execs.length}</span>
            </h2>
            <button
              onClick={() => goTo(0)}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              ✨ Run All
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="field mb-2 h-8 px-2 py-1 text-xs"
          />

          {/* Group by + assigned-to-me */}
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <div className="relative">
              <button
                onClick={() => setGroupOpen((o) => !o)}
                className="rounded-md bg-surface-muted px-2 py-1 font-medium text-muted hover:text-fg"
              >
                Group by: {GROUP_OPTIONS.find((o) => o.value === groupBy)!.label} ▾
              </button>
              {groupOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setGroupOpen(false)} />
                  <div className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-xl">
                    {GROUP_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => {
                          setGroupBy(o.value);
                          setGroupOpen(false);
                        }}
                        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${
                          o.value === groupBy ? "text-fg" : "text-muted"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={assignedToMe}
                onChange={(e) => setAssignedToMe(e.target.checked)}
              />
              Show assigned to me
              <span className="rounded bg-surface-muted px-1 py-0.5 text-[10px] text-subtle">
                {assignedCount}
              </span>
            </label>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
                    <span>{g.label}</span>
                    <span className="text-subtle">{g.items.length}</span>
                  </div>
                )}
                <ul className="space-y-1">
                  {g.items.map((e) => (
                    <li
                      key={e.id}
                      className={`rounded-md border-l-4 ${execMeta(e.status).border} ${
                        cur?.id === e.id ? "bg-surface-muted" : ""
                      }`}
                    >
                      <button
                        onClick={() => goTo(execs.findIndex((x) => x.id === e.id))}
                        className="w-full px-2 py-1.5 text-left text-xs hover:bg-surface-muted"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={flagColor[e.casePriority]} title={e.casePriority}>
                            ⚑
                          </span>
                          <span className="truncate font-mono text-[11px] text-ring">
                            {e.caseKey ?? "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-fg">{e.caseTitle}</div>
                      </button>
                      {/* Set all below */}
                      <div className="relative px-2 pb-1.5">
                        <button
                          onClick={() =>
                            setSetBelowFor((v) => (v === e.id ? null : e.id))
                          }
                          className="text-[11px] text-subtle hover:text-fg"
                        >
                          Set all below to: ▾
                        </button>
                        {setBelowFor === e.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setSetBelowFor(null)}
                            />
                            <div className="absolute left-2 z-20 mt-1 w-48 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-xl">
                              {EXEC_STATUS_META.map((s) => (
                                <button
                                  key={s.value}
                                  onClick={() => setAllBelow(e.id, s.value)}
                                  className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-muted"
                                >
                                  <span className={`h-4 w-4 shrink-0 rounded-sm ${s.swatch}`} />
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {flat.length === 0 && (
              <p className="px-2 py-3 text-xs text-subtle">No test cases.</p>
            )}
          </div>
        </aside>

        {/* Execution panel */}
        <section className="card min-h-0 overflow-y-auto p-4">
          {!cur ? (
            <div className="flex h-full items-center justify-center text-sm text-subtle">
              No test cases in this cycle. Add some from the cycle page.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Case header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-fg">
                    <span className="font-mono text-sm text-ring">{cur.caseKey}</span>{" "}
                    {cur.caseTitle}
                  </h2>
                  <p className="mt-0.5 text-xs text-subtle">
                    Est. {fmtEst(cur.caseEstimatedTime)} · executed by{" "}
                    {cur.executedByName ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDropdown
                    value={cur.status}
                    onChange={(s) => patchExec(cur.id, { status: s })}
                  />
                  <button
                    onClick={toggleTimer}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-fg hover:bg-surface-muted"
                    title={running ? "Pause timer" : "Start timer"}
                  >
                    {running ? "⏸" : "▶"} {fmt(elapsed)}
                  </button>
                </div>
              </div>

              <Section title="Execution Details">
                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className={labelCls}>Environment</label>
                    <input
                      value={cur.environment ?? ""}
                      onChange={(e) => setExecs((p) => p.map((x) => (x.id === cur.id ? { ...x, environment: e.target.value } : x)))}
                      onBlur={(e) => recordExecution(cur.id, { environment: e.target.value })}
                      placeholder="None"
                      className={inlineCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Iteration</label>
                    <input
                      value={cur.iteration ?? ""}
                      onChange={(e) => setExecs((p) => p.map((x) => (x.id === cur.id ? { ...x, iteration: e.target.value } : x)))}
                      onBlur={(e) => recordExecution(cur.id, { iteration: e.target.value })}
                      placeholder="None"
                      className={inlineCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Release version</label>
                    <input
                      value={cur.releaseVersion ?? ""}
                      onChange={(e) => setExecs((p) => p.map((x) => (x.id === cur.id ? { ...x, releaseVersion: e.target.value } : x)))}
                      onBlur={(e) => recordExecution(cur.id, { releaseVersion: e.target.value })}
                      placeholder="None"
                      className={inlineCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Assigned to</label>
                    <SelectField
                      value={cur.assignedToName ?? ""}
                      options={userOpts}
                      onChange={(v) => patchExec(cur.id, { assignedToName: v || null })}
                      placeholder="Unassigned"
                      searchable
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Executed by</label>
                    <div className="px-2 py-1.5 text-sm text-fg">
                      {cur.executedByName ?? "—"}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Actual time</label>
                    <div className="px-2 py-1.5 font-mono text-sm text-fg">{fmt(cur.actualTime)}</div>
                  </div>
                </div>
              </Section>

              <Section title={<span>Test Case Details <span className="ml-1 rounded bg-surface-muted px-1 py-0.5 text-[10px] text-subtle">READ ONLY</span></span>} defaultOpen={false}>
                <div className="space-y-3 text-sm">
                  {cur.caseObjective && (
                    <div>
                      <p className={labelCls}>Objective</p>
                      <p className="whitespace-pre-wrap text-fg">{cur.caseObjective}</p>
                    </div>
                  )}
                  {cur.casePreconditions && (
                    <div>
                      <p className={labelCls}>Preconditions</p>
                      <p className="whitespace-pre-wrap text-fg">{cur.casePreconditions}</p>
                    </div>
                  )}
                  {!cur.caseObjective && !cur.casePreconditions && (
                    <p className="text-subtle">No details.</p>
                  )}
                </div>
              </Section>

              <Section title="Comment" defaultOpen={false}>
                <textarea
                  rows={3}
                  value={cur.notes ?? ""}
                  onChange={(e) => setExecs((p) => p.map((x) => (x.id === cur.id ? { ...x, notes: e.target.value } : x)))}
                  onBlur={(e) => recordExecution(cur.id, { notes: e.target.value })}
                  placeholder="Add a comment…"
                  className="field text-sm"
                />
              </Section>

              <Section title={`Issues${cur.defectRef ? "(1)" : "(0)"}`} defaultOpen={false}>
                <input
                  value={cur.defectRef ?? ""}
                  onChange={(e) => setExecs((p) => p.map((x) => (x.id === cur.id ? { ...x, defectRef: e.target.value } : x)))}
                  onBlur={(e) => recordExecution(cur.id, { defectRef: e.target.value })}
                  placeholder="Link an issue key (e.g. APP-1234)"
                  className="field text-sm"
                />
              </Section>

              <Section title="Attachments" defaultOpen={false}>
                <div className="rounded-lg border border-dashed border-line py-6 text-center text-sm text-subtle">
                  Drop files to attach — coming soon
                </div>
              </Section>

              <Section title="Test Script">
                {cur.caseSteps.length === 0 ? (
                  <p className="text-sm text-subtle">This case has no step-by-step script.</p>
                ) : (
                  <div className="space-y-2">
                    {cur.caseSteps.map((s, i) => {
                      const st = cur.stepResults[i]?.status || "";
                      const borderCls =
                        st === "pass"
                          ? "border-l-green-500"
                          : st === "fail"
                            ? "border-l-red-500"
                            : st === "blocked"
                              ? "border-l-blue-500"
                              : "border-l-line";
                      return (
                        <div
                          key={i}
                          className={`grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-3 rounded-md border border-line border-l-4 ${borderCls} p-2`}
                        >
                          <span className="pt-1.5 text-center text-sm text-subtle">{i + 1}</span>
                          <div className="whitespace-pre-wrap py-1.5 text-sm text-fg">{s.action}</div>
                          <div className="whitespace-pre-wrap py-1.5 text-sm text-muted">{s.testData || "None"}</div>
                          <div className="whitespace-pre-wrap py-1.5 text-sm text-muted">{s.expected}</div>
                          <div className="flex flex-col items-center gap-1 pt-1">
                            <button
                              onClick={() => setStep(cur.id, i, "pass")}
                              title="Pass"
                              className={`h-6 w-6 rounded ${st === "pass" ? "bg-green-600 text-white" : "text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10"}`}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setStep(cur.id, i, "fail")}
                              title="Fail"
                              className={`h-6 w-6 rounded ${st === "fail" ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"}`}
                            >
                              ✕
                            </button>
                            <button
                              onClick={() => setStep(cur.id, i, "blocked")}
                              title="Blocked"
                              className={`h-6 w-6 rounded ${st === "blocked" ? "bg-blue-600 text-white" : "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"}`}
                            >
                              ⊘
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* Nav */}
              <div className="flex items-center justify-between border-t border-line pt-4">
                <button
                  disabled={idx === 0}
                  onClick={() => goTo(idx - 1)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg hover:bg-surface-muted disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-xs text-subtle">
                  {idx + 1} of {execs.length}
                </span>
                <button
                  disabled={idx >= execs.length - 1}
                  onClick={() => goTo(idx + 1)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
