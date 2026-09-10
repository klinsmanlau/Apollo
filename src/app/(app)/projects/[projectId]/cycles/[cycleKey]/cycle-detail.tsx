"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PriorityFlag } from "@/components/ui";
import { SelectField, opts, type Opt } from "@/components/select-field";
import { CUSTOM_FIELDS } from "@/lib/custom-fields";
import {
  recordExecution,
  removeExecution,
  bulkAssignExecutions,
  bulkRemoveExecutions,
  autosaveCycle,
} from "@/lib/actions/cycles";
import { AddCasesModal } from "./add-cases-modal";
import type { WSuite } from "../../project-workspace";
import type { Priority, ExecutionStatus, CycleStatus } from "@prisma/client";
import { ArrowLeft, ChevronDown, ChevronRight, Play, X } from "@/components/icons";

type CaseUser = { id: string; name: string | null; email: string };

export type ExecRow = {
  id: string;
  status: ExecutionStatus;
  notes: string | null;
  caseId: string;
  caseKey: string | null;
  caseTitle: string;
  casePriority: Priority;
  executedByName: string | null;
  executedAt: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
};

export type CycleData = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  status: CycleStatus;
  version: string | null;
  iteration: string | null;
  ownerName: string | null;
  startDate: string;
  endDate: string;
  folderId: string | null;
  folderPath: string;
  customFields: Record<string, string>;
  folderOptions: Opt[];
  users: CaseUser[];
  executions: ExecRow[];
  suites: WSuite[];
  suiteCounts: Record<string, number>;
};

const TABS = ["Details", "Test cases", "Traceability", "History"] as const;
type Tab = (typeof TABS)[number];

const CYCLE_STATUS: Opt[] = [
  { value: "not_executed", label: "Not Executed" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];
const POD_OPTIONS = CUSTOM_FIELDS.find((f) => f.key === "POD")?.options ?? [];


const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";
const inlineCls =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-fg transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none placeholder:text-subtle";

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
          <span className="text-xs text-subtle">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
          {title}
        </button>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {open && <div className="pt-4">{children}</div>}
    </section>
  );
}

// Click the assignee name to open a dropdown of project users; picking one
// (or "Unassigned") updates the execution's assignee.
function AssigneeCell({
  value,
  valueName,
  users,
  onChange,
}: {
  value: string | null;
  valueName: string | null;
  users: CaseUser[];
  onChange: (id: string | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-fg transition-colors hover:bg-surface-muted"
      >
        <span className={valueName ? "" : "text-subtle"}>{valueName ?? "Unassigned"}</span>
        <span className="text-[9px] text-subtle"><ChevronDown size={13} /></span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 max-h-64 w-52 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-xl">
            <button
              onClick={() => {
                onChange(null, null);
                setOpen(false);
              }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted ${
                value == null ? "font-medium text-ring" : "text-subtle"
              }`}
            >
              Unassigned
            </button>
            {users.map((u) => {
              const name = u.name ?? u.email;
              const selected = u.id === value;
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    onChange(u.id, name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted ${
                    selected ? "bg-ring/10 font-medium text-ring" : "text-fg"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Bulk-assign dropdown ("Testers"). Collapsed to just Unassigned + the
 *  current user until the tester types something, at which point it becomes
 *  a live search across every project member. */
function TestersDropdown({
  disabled,
  users,
  currentUserId,
  currentUserName,
  onPick,
}: {
  disabled: boolean;
  users: CaseUser[];
  currentUserId: string;
  currentUserName: string;
  onPick: (id: string | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => (u.name ?? u.email).toLowerCase().includes(q))
    : [];

  function pick(id: string | null, name: string | null) {
    onPick(id, name);
    setOpen(false);
    setQuery("");
  }
  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary"
      >
        Testers <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-line bg-surface shadow-xl">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search testers…"
              className="w-full border-b border-line bg-transparent px-3 py-2 text-sm text-fg outline-none placeholder:text-subtle"
            />
            <div className="max-h-56 overflow-y-auto py-1">
              {!q ? (
                <>
                  <button
                    onClick={() => pick(null, null)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-subtle transition-colors hover:bg-surface-muted"
                  >
                    Unassigned
                  </button>
                  <button
                    onClick={() => pick(currentUserId, currentUserName)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-muted"
                  >
                    {currentUserName}
                  </button>
                </>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-subtle">No matches</p>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => pick(u.id, u.name ?? u.email)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-muted"
                  >
                    {u.name ?? u.email}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CycleDetail({
  projectId,
  initial,
  currentUserId,
  currentUserName,
}: {
  projectId: string;
  initial: CycleData;
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Details");
  const [c, setC] = useState<CycleData>(initial);
  const [execs, setExecs] = useState<ExecRow[]>(initial.executions);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [exportOpen, setExportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function exportResults(format: "xlsx" | "csv") {
    setExportOpen(false);
    const res = await fetch(
      `/api/projects/${projectId}/cycles/${c.id}/export?format=${format}`
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(c.key ?? "cycle").toLowerCase()}-results.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Re-sync executions when the server sends fresh data (e.g. after adding
  // cases). Only fires on refresh/navigation, so it won't clobber tab edits.
  useEffect(() => {
    setExecs(initial.executions);
  }, [initial.executions]);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userOpts: Opt[] = c.users.map((u) => ({
    value: u.name ?? u.email,
    label: u.name ?? u.email,
  }));

  async function flush() {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaveState("saving");
    await autosaveCycle(c.id, patch);
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
  }
  function scheduleSave(p: Record<string, unknown>) {
    Object.assign(pending.current, p);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }
  function saveNow(p: Record<string, unknown>) {
    Object.assign(pending.current, p);
    if (timer.current) clearTimeout(timer.current);
    flush();
  }
  function edit<K extends keyof CycleData>(key: K, value: CycleData[K], immediate = false) {
    setC((prev) => ({ ...prev, [key]: value }));
    if (immediate) saveNow({ [key]: value });
    else scheduleSave({ [key]: value });
  }
  function editCustom(key: string, v: string) {
    const next = { ...c.customFields, [key]: v };
    setC((prev) => ({ ...prev, customFields: next }));
    saveNow({ customFields: next });
  }

  // ---- executions ----
  function remove(id: string) {
    setExecs((prev) => prev.filter((e) => e.id !== id));
    removeExecution(id);
  }
  // Change a case's assignee: update the row optimistically, then persist.
  function setAssignee(id: string, assignedToId: string | null, assignedToName: string | null) {
    setExecs((prev) =>
      prev.map((e) => (e.id === id ? { ...e, assignedToId, assignedToName } : e))
    );
    recordExecution(id, { assignedToId, assignedToName });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === execs.length ? new Set() : new Set(execs.map((e) => e.id))
    );
  }
  function bulkAssign(assignedToId: string | null, assignedToName: string | null) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setExecs((prev) =>
      prev.map((e) => (selected.has(e.id) ? { ...e, assignedToId, assignedToName } : e))
    );
    bulkAssignExecutions(ids, assignedToId, assignedToName);
    setSelected(new Set());
  }
  function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setExecs((prev) => prev.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
    bulkRemoveExecutions(ids);
  }

  const folderLabel =
    c.folderOptions.find((o) => o.value === (c.folderId ?? ""))?.label ??
    (c.folderPath ? "/" + c.folderPath.replace(/ \/ /g, "/") : "— Top level —");

  // Case links from this table carry a "Go Back" trail — clicking a case,
  // then "Go Back", returns here rather than to the case's own folder.
  const caseReturnTo = encodeURIComponent(`/projects/${projectId}/cycles/${c.key ?? c.id}`);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/projects/${projectId}/cycles`}
              className="inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-fg"
            >
              <ArrowLeft size={14} /> Test Cycles{c.folderPath ? ` · ${c.folderPath}` : ""}
            </Link>
            {c.key && (
              <p className="mt-1 font-mono text-xs text-subtle">{c.key}</p>
            )}
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">
              {c.name || "Untitled cycle"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-1">
            <span className="text-xs text-subtle">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : ""}
            </span>
            <div className="relative">
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="btn btn-secondary"
              >
                Export results <ChevronDown size={12} />
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
                  <button
                    onClick={() => exportResults("xlsx")}
                    className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-muted"
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => exportResults("csv")}
                    className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-muted"
                  >
                    CSV (.csv)
                  </button>
                </div>
              )}
            </div>
            <Link
              href={`/projects/${projectId}/cycles/${c.key ?? c.id}/play`}
              className="btn btn-accent"
            >
              <Play size={13} /> Test Player
            </Link>
          </div>
        </div>

        <div className="mt-3 flex gap-4 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-ring text-fg"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {t}
              {t === "Test cases" && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-subtle">
                  {execs.length}
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
                    value={c.name}
                    onChange={(e) => edit("name", e.target.value)}
                    onBlur={flush}
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Description</label>
                  <textarea
                    rows={2}
                    value={c.description ?? ""}
                    onChange={(e) => edit("description", e.target.value)}
                    onBlur={flush}
                    placeholder="Click to type a description"
                    className={inlineCls}
                  />
                </div>
              </div>
            </Section>

            <Section title="Details">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelCls}>Folder</label>
                  <SelectField
                    value={c.folderId ?? ""}
                    options={c.folderOptions}
                    onChange={(v) => edit("folderId", v || null, true)}
                    allowClear={false}
                    searchable
                  />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <SelectField
                    value={c.status}
                    options={CYCLE_STATUS}
                    onChange={(v) => edit("status", (v || "not_executed") as CycleStatus, true)}
                    allowClear={false}
                  />
                </div>
                <div>
                  <label className={labelCls}>Release version</label>
                  <input
                    value={c.version ?? ""}
                    onChange={(e) => edit("version", e.target.value)}
                    onBlur={flush}
                    placeholder="None"
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Iteration</label>
                  <input
                    value={c.iteration ?? ""}
                    onChange={(e) => edit("iteration", e.target.value)}
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
                  <label className={labelCls}>Planned start date</label>
                  <input
                    type="date"
                    value={c.startDate}
                    onChange={(e) => edit("startDate", e.target.value, true)}
                    className={inlineCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Planned end date</label>
                  <input
                    type="date"
                    value={c.endDate}
                    onChange={(e) => edit("endDate", e.target.value, true)}
                    className={inlineCls}
                  />
                </div>
              </div>
            </Section>

            <Section
              title="Custom Fields (1)"
              right={
                <span className="cursor-default text-xs text-subtle">
                  Manage custom fields
                </span>
              }
            >
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelCls}>POD</label>
                  <SelectField
                    value={c.customFields["POD"] ?? ""}
                    options={opts(POD_OPTIONS)}
                    onChange={(v) => editCustom("POD", v)}
                  />
                </div>
              </div>
            </Section>

            <p className="pt-1 text-xs text-subtle">Folder: {folderLabel}</p>
          </div>
        )}

        {tab === "Test cases" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <AddCasesModal
                projectId={projectId}
                cycleId={c.id}
                existingCaseIds={execs.map((e) => e.caseId)}
                suites={c.suites}
                suiteCounts={c.suiteCounts}
                onAdded={() => router.refresh()}
              />
              <TestersDropdown
                disabled={selected.size === 0}
                users={c.users}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                onPick={bulkAssign}
              />
              <button
                disabled={selected.size === 0}
                onClick={bulkDelete}
                className="btn btn-secondary text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Delete{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            </div>

            {execs.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-subtle">
                No test cases in this cycle yet. Use “Add test cases”.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-muted text-[11px] uppercase tracking-wide text-subtle">
                    <tr>
                      <th className="w-8 px-2 py-1.5 text-left">
                        <input
                          type="checkbox"
                          checked={execs.length > 0 && selected.size === execs.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="w-8 px-2 py-1.5 text-left font-semibold">P</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Key</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Test case</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Assigned to</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Executed by</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {execs.map((e) => (
                      <tr key={e.id} className="border-t border-line align-middle">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={selected.has(e.id)}
                            onChange={() => toggleSelected(e.id)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <PriorityFlag priority={e.casePriority} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <Link
                            href={`/projects/${projectId}/cases/${e.caseKey ?? e.caseId}?returnTo=${caseReturnTo}`}
                            className="font-mono text-xs text-ring hover:underline"
                          >
                            {e.caseKey ?? "—"}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">
                          <Link
                            href={`/projects/${projectId}/cases/${e.caseKey ?? e.caseId}?returnTo=${caseReturnTo}`}
                            className="text-fg hover:text-ring hover:underline"
                          >
                            {e.caseTitle}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">
                          <AssigneeCell
                            value={e.assignedToId}
                            valueName={e.assignedToName}
                            users={c.users}
                            onChange={(id, name) => setAssignee(e.id, id, name)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-xs text-subtle">
                          {e.executedByName ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => remove(e.id)}
                            className="text-subtle transition-colors hover:text-red-500"
                            title="Remove from cycle"
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {(tab === "Traceability" || tab === "History") && (
          <div className="flex h-full items-center justify-center py-16 text-sm text-subtle">
            {tab} — coming in a later phase.
          </div>
        )}
      </div>
    </div>
  );
}
