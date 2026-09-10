"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { PriorityFlag } from "@/components/ui";
import { addCasesToCycle } from "@/lib/actions/cycles";
import { ArrowLeft, ChevronDown, ChevronRight } from "@/components/icons";
import type { Priority } from "@prisma/client";
import type { WSuite } from "../../project-workspace";

type CaseLite = { id: string; title: string; key: string | null; priority: Priority };
const PAGE_SIZE_OPTIONS = [40, 60, 80, 100] as const;
const DEFAULT_PAGE_SIZE = 40;

const TREE_MIN = 180;
const TREE_MAX = 360;
const TREE_WIDTH_KEY = "apollo.addCasesModal.treeWidth";

/** Page numbers with an ellipsis for large counts, e.g. [0,1,2,3,4,"…",224]. */
function pageList(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  if (current <= 4) return [0, 1, 2, 3, 4, "…", count - 1];
  if (current >= count - 5) {
    return [0, "…", count - 5, count - 4, count - 3, count - 2, count - 1];
  }
  return [0, "…", current - 1, current, current + 1, "…", count - 1];
}

/** One folder row + its children, read-only navigation (no rename/drag —
 *  this is just a picker, folder management lives in the workspace). */
function FolderNode({
  suite,
  depth,
  childrenOf,
  countFor,
  selected,
  onSelect,
  expanded,
  toggleExpanded,
}: {
  suite: WSuite;
  depth: number;
  childrenOf: Map<string | null, WSuite[]>;
  countFor: (id: string) => number;
  selected: string | null;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  const kids = childrenOf.get(suite.id) ?? [];
  const open = expanded.has(suite.id);
  return (
    <li>
      <div
        onClick={() => onSelect(suite.id)}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={`flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors ${
          selected === suite.id
            ? "bg-primary/10 text-fg"
            : "text-muted hover:bg-surface-muted hover:text-fg"
        }`}
      >
        {kids.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(suite.id);
            }}
            className="flex w-5 shrink-0 items-center justify-center text-subtle hover:text-fg"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-5 shrink-0 text-center text-subtle">•</span>
        )}
        <span className="truncate">{suite.name}</span>
        <span className="ml-auto shrink-0 text-xs text-subtle">{countFor(suite.id)}</span>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <FolderNode
              key={k.id}
              suite={k}
              depth={depth + 1}
              childrenOf={childrenOf}
              countFor={countFor}
              selected={selected}
              onSelect={onSelect}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function AddCasesModal({
  projectId,
  cycleId,
  existingCaseIds,
  suites,
  suiteCounts,
  onAdded,
}: {
  projectId: string;
  cycleId: string;
  existingCaseIds: string[];
  suites: WSuite[];
  suiteCounts: Record<string, number>;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CaseLite[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const existing = new Set(existingCaseIds);

  // Draggable divider between the folder tree and the case list, remembered
  // per-browser (same pattern as the Test Player's rail resize).
  const [treeWidth, setTreeWidth] = useState(224);
  useEffect(() => {
    const saved = Number(localStorage.getItem(TREE_WIDTH_KEY));
    if (saved >= TREE_MIN && saved <= TREE_MAX) setTreeWidth(saved);
  }, []);
  function startTreeResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = treeWidth;
    function onMove(ev: MouseEvent) {
      const next = Math.min(TREE_MAX, Math.max(TREE_MIN, startWidth + (ev.clientX - startX)));
      setTreeWidth(next);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setTreeWidth((w) => {
        localStorage.setItem(TREE_WIDTH_KEY, String(w));
        return w;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, WSuite[]>();
    for (const s of suites) {
      const arr = m.get(s.parentSuiteId) ?? [];
      arr.push(s);
      m.set(s.parentSuiteId, arr);
    }
    for (const arr of m.values())
      arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return m;
  }, [suites]);

  const subtreeOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const collect = (id: string): Set<string> => {
      if (m.has(id)) return m.get(id)!;
      const set = new Set<string>([id]);
      for (const ch of childrenOf.get(id) ?? []) {
        for (const d of collect(ch.id)) set.add(d);
      }
      m.set(id, set);
      return set;
    };
    for (const s of suites) collect(s.id);
    return m;
  }, [suites, childrenOf]);

  const totalCount = useMemo(
    () => Object.values(suiteCounts).reduce((a, b) => a + b, 0),
    [suiteCounts]
  );
  const countFor = (suiteId: string) => {
    let n = 0;
    for (const id of subtreeOf.get(suiteId) ?? [suiteId]) n += suiteCounts[id] ?? 0;
    return n;
  };

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function load(
    query: string,
    pageVal: number,
    folderVal: string | null,
    pageSizeVal: number
  ) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("page", String(pageVal));
    params.set("pageSize", String(pageSizeVal));
    if (folderVal) {
      const ids = [...(subtreeOf.get(folderVal) ?? [folderVal])];
      params.set("suiteIds", ids.join(","));
    }
    const res = await fetch(`/api/projects/${projectId}/cases?${params}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const d = (await res.json()) as { cases: CaseLite[]; total: number };
      setRows(d.cases);
      setTotal(d.total);
    }
    setLoading(false);
  }
  function openModal() {
    setOpen(true);
    setSel(new Set());
    setQ("");
    setPage(0);
    setFolder(null);
    load("", 0, null, pageSize);
  }
  function selectFolder(id: string | null) {
    setFolder(id);
    setPage(0);
    load(q, 0, id, pageSize);
  }
  function changePageSize(n: number) {
    setPageSize(n);
    setPage(0);
    load(q, 0, folder, n);
  }
  async function confirm() {
    if (sel.size === 0) return;
    setBusy(true);
    await addCasesToCycle(cycleId, [...sel]);
    setBusy(false);
    setOpen(false);
    onAdded();
  }

  const roots = childrenOf.get(null) ?? [];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <button onClick={openModal} className="btn btn-primary shrink-0">
        + Add test cases
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add test cases to cycle"
        maxWidth="max-w-6xl"
      >
        <div className="flex gap-0">
          {/* Folder tree */}
          <div style={{ width: treeWidth }} className="relative shrink-0 pr-3">
            <ul className="max-h-[65vh] space-y-0.5 overflow-y-auto">
              <li>
                <div
                  onClick={() => selectFolder(null)}
                  className={`flex cursor-pointer items-center gap-1 rounded-md py-1.5 pl-2 pr-2 text-sm font-medium transition-colors ${
                    folder === null
                      ? "bg-primary/10 text-fg"
                      : "text-muted hover:bg-surface-muted hover:text-fg"
                  }`}
                >
                  <span className="truncate">All test cases</span>
                  <span className="ml-auto shrink-0 text-xs text-subtle">{totalCount}</span>
                </div>
              </li>
              {roots.map((s) => (
                <FolderNode
                  key={s.id}
                  suite={s}
                  depth={1}
                  childrenOf={childrenOf}
                  countFor={countFor}
                  selected={folder}
                  onSelect={selectFolder}
                  expanded={expanded}
                  toggleExpanded={toggleExpanded}
                />
              ))}
            </ul>
            {/* Drag to resize; clamped to TREE_MIN..TREE_MAX. */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              onMouseDown={startTreeResize}
              className="group absolute -right-2 top-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center"
            >
              <span className="h-10 w-1 rounded-full bg-line transition-colors group-hover:bg-ring" />
            </div>
          </div>

          {/* Case list */}
          <div className="min-w-0 flex-1 space-y-3 border-l border-line pl-4">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
                load(e.target.value, 0, folder, pageSize);
              }}
              placeholder="Search cases by name or key…"
              className="field"
            />
            <div className="h-[55vh] overflow-y-auto rounded-md border border-line">
              {rows.length === 0 && (
                <p className="p-4 text-sm text-subtle">
                  {loading ? "Loading…" : "No cases found."}
                </p>
              )}
              {rows.map((c) => {
                const added = existing.has(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-0 hover:bg-surface-muted ${
                      added ? "opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={added}
                      checked={added || sel.has(c.id)}
                      onChange={() =>
                        setSel((prev) => {
                          const n = new Set(prev);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          return n;
                        })
                      }
                    />
                    <PriorityFlag priority={c.priority} />
                    <span className="w-20 shrink-0 font-mono text-xs text-subtle">
                      {c.key ?? "—"}
                    </span>
                    <span className="flex-1 truncate text-fg">{c.title}</span>
                    {added && <span className="text-xs text-subtle">added</span>}
                  </label>
                );
              })}
            </div>
            <div className="grid grid-cols-3 items-center gap-2 text-xs text-subtle">
              <span>
                {total} case{total === 1 ? "" : "s"}
                {loading ? " · loading…" : ""}
              </span>
              <div className="flex items-center justify-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    load(q, p, folder, pageSize);
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  <ArrowLeft size={14} /> Prev
                </button>
                {pageList(page, pageCount).map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-1">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => {
                        setPage(p);
                        load(q, p, folder, pageSize);
                      }}
                      className={`min-w-[1.75rem] rounded px-1.5 py-1 text-center ${
                        p === page
                          ? "bg-primary/10 font-semibold text-fg"
                          : "hover:bg-surface-muted"
                      }`}
                    >
                      {p + 1}
                    </button>
                  )
                )}
                <button
                  disabled={(page + 1) * pageSize >= total}
                  onClick={() => {
                    const p = page + 1;
                    setPage(p);
                    load(q, p, folder, pageSize);
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
              <label className="flex items-center justify-end gap-1.5">
                Show
                <select
                  value={pageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                  className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-fg"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                per page
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button onClick={() => setOpen(false)} className="btn btn-secondary">
            Cancel
          </button>
          <button
            disabled={busy || sel.size === 0}
            onClick={confirm}
            className="btn btn-primary"
          >
            {busy ? "Adding…" : `Add ${sel.size || ""} case${sel.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </Modal>
    </>
  );
}
