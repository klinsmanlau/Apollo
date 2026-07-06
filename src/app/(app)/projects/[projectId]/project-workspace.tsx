"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Priority, CaseType, CaseStatus } from "@prisma/client";
import { PriorityBadge, CaseStatusBadge } from "@/components/ui";
import { NewCaseModal } from "./new-case-modal";
import {
  moveCase,
  moveSuite,
  cloneCases,
  archiveCases,
  addSuite,
  renameSuite,
  removeSuite,
} from "@/lib/actions/workspace";

export type WSuite = { id: string; name: string; parentSuiteId: string | null };
export type WCase = {
  id: string;
  title: string;
  key: string | null;
  sourceKey: string | null;
  priority: Priority;
  type: CaseType;
  status: CaseStatus;
  suiteId: string;
};

type Drag = { kind: "case"; id: string } | { kind: "suite"; id: string } | null;

const PAGE_SIZE = 50;
const ARCHIVED = "__archived__";

type SortField = "key" | "title" | "priority" | "status";
type SortDir = "asc" | "desc";

/** Inline text field for creating or renaming a folder. */
function FolderInput({
  initial = "",
  depth = 0,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  depth?: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div
      style={{ paddingLeft: `${depth * 14 + 6}px` }}
      className="flex items-center gap-1 py-1"
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) onSubmit(v.trim());
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={() => (v.trim() ? onSubmit(v.trim()) : onCancel())}
        placeholder="Folder name"
        className="field h-7 flex-1 px-2 py-0 text-xs"
      />
      <button
        type="button"
        // preventDefault so the input's blur doesn't fire before this click.
        onMouseDown={(e) => {
          e.preventDefault();
          onCancel();
        }}
        className="shrink-0 rounded p-1 text-subtle hover:text-fg"
        aria-label="Cancel"
      >
        ✕
      </button>
    </div>
  );
}

export function ProjectWorkspace({
  projectId,
  suites,
  directCounts,
  archivedCount,
  initialCases,
  initialTotal,
  initialFolder,
}: {
  projectId: string;
  suites: WSuite[];
  directCounts: Record<string, number>;
  archivedCount: number;
  initialCases: WCase[];
  initialTotal: number;
  initialFolder: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Case rows are fetched on demand (per folder + page); see load().
  const [rows, setRows] = useState<WCase[]>(initialCases);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // Mirror of the sort so handlers never read a stale closure value.
  const sortRef = useRef<{ field: SortField | null; dir: SortDir }>({
    field: null,
    dir: "asc",
  });

  const [selectedSuite, setSelectedSuite] = useState<string | null>(
    initialFolder && suites.some((s) => s.id === initialFolder)
      ? initialFolder
      : null
  );
  const [folderQuery, setFolderQuery] = useState("");
  const [caseQuery, setCaseQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Collapsed by default (top-level folders only).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Inline folder creation: { parent } where parent null = top level.
  const [creating, setCreating] = useState<{ parent: string | null } | null>(
    null
  );

  const archivedView = selectedSuite === ARCHIVED;

  // ---- resizable left panel --------------------------------------------
  const DEFAULT_LEFT = 360;
  const MIN_LEFT = 260;
  const MAX_LEFT = 640;
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [resizing, setResizing] = useState(false);

  // Restore saved width after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const v = Number(localStorage.getItem("ws-left-width"));
    if (v >= MIN_LEFT && v <= MAX_LEFT) setLeftWidth(v);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const w = Math.min(MAX_LEFT, Math.max(MIN_LEFT, e.clientX - rect.left));
      setLeftWidth(w);
    };
    const onUp = () => setResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing]);

  useEffect(() => {
    try {
      localStorage.setItem("ws-left-width", String(leftWidth));
    } catch {}
  }, [leftWidth]);

  // ---- tree + descendant maps ------------------------------------------
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, WSuite[]>();
    for (const s of suites) {
      const arr = m.get(s.parentSuiteId) ?? [];
      arr.push(s);
      m.set(s.parentSuiteId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
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

  // Total active cases (for the "All test cases" row).
  const totalCount = useMemo(
    () => Object.values(directCounts).reduce((a, b) => a + b, 0),
    [directCounts]
  );

  // Descendant-inclusive count for a folder, from the aggregate map.
  const countFor = (suiteId: string) => {
    let n = 0;
    for (const id of subtreeOf.get(suiteId) ?? [suiteId]) n += directCounts[id] ?? 0;
    return n;
  };

  // ---- right-panel case list (server-fetched, paginated) ---------------
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allVisibleSelected =
    rows.length > 0 && rows.every((c) => selected.has(c.id));

  // Fetch one page of cases for the given scope/search/page/sort.
  async function load(
    scopeVal: string | null,
    q: string,
    pageVal: number,
    sort: SortField | null = sortRef.current.field,
    dir: SortDir = sortRef.current.dir
  ) {
    // Cancel any in-flight request so only the latest one wins.
    loadAbort.current?.abort();
    const ac = new AbortController();
    loadAbort.current = ac;

    setLoading(true);
    const params = new URLSearchParams();
    if (scopeVal === ARCHIVED) {
      params.set("archived", "1");
    } else if (scopeVal) {
      // Send the folder's subtree ids we already know (skips a DB lookup).
      const ids = [...(subtreeOf.get(scopeVal) ?? [scopeVal])];
      params.set("suiteIds", ids.join(","));
    }
    if (q.trim()) params.set("q", q.trim());
    params.set("page", String(pageVal));
    if (sort) {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    try {
      const res = await fetch(
        `/api/projects/${projectId}/cases?${params.toString()}`,
        { cache: "no-store", signal: ac.signal }
      );
      if (res.ok && loadAbort.current === ac) {
        const data = (await res.json()) as { cases: WCase[]; total: number };
        setRows(data.cases);
        setTotal(data.total);
      }
    } catch {
      // Ignore aborted/failed requests.
    } finally {
      if (loadAbort.current === ac) setLoading(false);
    }
  }

  function onCaseSearch(v: string) {
    setCaseQuery(v);
    setPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(selectedSuite, v, 0), 300);
  }

  function goToPage(p: number) {
    const clamped = Math.min(Math.max(0, p), pageCount - 1);
    setPage(clamped);
    load(selectedSuite, caseQuery, clamped);
  }

  // Click a header: first click sorts ascending, clicking the same header
  // again toggles the direction. Read/write the ref so repeat clicks never
  // act on a stale closure.
  function onSort(field: SortField) {
    const prev = sortRef.current;
    const dir: SortDir =
      prev.field === field && prev.dir === "asc" ? "desc" : "asc";
    sortRef.current = { field, dir };
    setSortField(field);
    setSortDir(dir);
    setPage(0);
    load(selectedSuite, caseQuery, 0, field, dir);
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((c) => next.delete(c.id));
      else rows.forEach((c) => next.add(c.id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectFolder(id: string | null) {
    setSelectedSuite(id);
    setPage(0);
    setSelected(new Set());
    load(id, caseQuery, 0);
  }

  // ---- server ops ------------------------------------------------------
  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      // Refetch the current view and refresh folder counts (RSC).
      await load(selectedSuite, caseQuery, page);
      router.refresh();
    });
  }

  function onDropOnSuite(targetSuiteId: string, drag: Drag) {
    if (!drag) return;
    if (drag.kind === "case") {
      const ids =
        selected.has(drag.id) && selected.size > 1 ? [...selected] : [drag.id];
      run(async () => {
        await Promise.all(ids.map((id) => moveCase(projectId, id, targetSuiteId)));
        setSelected(new Set());
      });
    } else if (drag.kind === "suite" && drag.id !== targetSuiteId) {
      run(() => moveSuite(projectId, drag.id, targetSuiteId));
    }
  }

  function expandSubtree(id: string, open: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const d of subtreeOf.get(id) ?? [id]) {
        if (open) next.add(d);
        else if (d !== id) next.delete(d);
      }
      if (open) next.add(id);
      return next;
    });
  }

  const selectedIds = [...selected];

  async function doExport(format: "xlsx" | "csv") {
    setExportOpen(false);
    // Export the selection, or the whole current scope when nothing is checked.
    const body =
      selectedIds.length > 0
        ? { ids: selectedIds, format }
        : {
            suiteId:
              selectedSuite && selectedSuite !== ARCHIVED
                ? selectedSuite
                : undefined,
            archived: selectedSuite === ARCHIVED,
            q: caseQuery.trim() || undefined,
            format,
          };
    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-cases.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    setOpenMenu(null);
  }

  // ---- folder tree rendering ------------------------------------------
  const folderMatch = (s: WSuite) =>
    !folderQuery.trim() ||
    s.name.toLowerCase().includes(folderQuery.trim().toLowerCase());

  function FolderNode({ suite, depth }: { suite: WSuite; depth: number }) {
    const kids = childrenOf.get(suite.id) ?? [];
    const isSelected = selectedSuite === suite.id;
    const isDrop = dropTarget === suite.id;
    // While searching, force branches open so matches are visible.
    const open = !!folderQuery.trim() || expanded.has(suite.id);
    const menuOpen = openMenu === suite.id;

    const subtreeMatch =
      folderMatch(suite) ||
      [...(subtreeOf.get(suite.id) ?? [])].some((id) => {
        const s = suites.find((x) => x.id === id);
        return s && folderMatch(s);
      });
    if (!subtreeMatch) return null;

    return (
      <li>
        {renaming === suite.id ? (
          <FolderInput
            initial={suite.name}
            depth={depth}
            onSubmit={(name) =>
              run(async () => {
                await renameSuite(projectId, suite.id, name);
                setRenaming(null);
              })
            }
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(
                "application/json",
                JSON.stringify({ kind: "suite", id: suite.id })
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(suite.id);
            }}
            onDragLeave={() => setDropTarget((d) => (d === suite.id ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(null);
              try {
                onDropOnSuite(
                  suite.id,
                  JSON.parse(e.dataTransfer.getData("application/json"))
                );
              } catch {}
            }}
            onClick={() => selectFolder(suite.id)}
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
            className={`group relative flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-1 text-sm transition-colors ${
              isSelected
                ? "bg-primary/10 text-fg"
                : "text-muted hover:bg-surface-muted hover:text-fg"
            } ${isDrop ? "ring-2 ring-ring ring-inset" : ""}`}
          >
            {kids.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(suite.id)) next.delete(suite.id);
                    else next.add(suite.id);
                    return next;
                  });
                }}
                className="flex w-6 shrink-0 items-center justify-center text-xl leading-none text-subtle transition-colors hover:text-fg"
              >
                {open ? "▾" : "▸"}
              </button>
            ) : (
              <span className="w-6 shrink-0 text-center text-xl leading-none text-subtle">
                •
              </span>
            )}
            <span className="truncate">{suite.name}</span>
            <span className="ml-auto shrink-0 text-xs text-subtle group-hover:hidden">
              {countFor(suite.id)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(menuOpen ? null : suite.id);
              }}
              className={`ml-auto hidden h-6 w-6 shrink-0 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg group-hover:flex ${
                menuOpen ? "!flex bg-surface text-fg" : ""
              }`}
              aria-label="Folder options"
            >
              ⋯
            </button>

            {menuOpen && (
              <FolderMenu suite={suite} depth={depth} />
            )}
          </div>
        )}

        {open && (creating?.parent === suite.id || kids.length > 0) && (
          <ul>
            {creating?.parent === suite.id && (
              <li>
                <FolderInput
                  depth={depth + 1}
                  onSubmit={(name) =>
                    run(async () => {
                      await addSuite(projectId, name, suite.id);
                      setCreating(null);
                    })
                  }
                  onCancel={() => setCreating(null)}
                />
              </li>
            )}
            {kids.map((k) => (
              <FolderNode key={k.id} suite={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  function FolderMenu({ suite }: { suite: WSuite; depth: number }) {
    const Item = ({
      onClick,
      children,
      disabled,
    }: {
      onClick?: () => void;
      children: React.ReactNode;
      disabled?: boolean;
    }) => (
      <button
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {children}
      </button>
    );
    const Divider = () => <div className="my-1 border-t border-line" />;

    return (
      <>
        {/* click-away backdrop */}
        <div
          className="fixed inset-0 z-20"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenu(null);
          }}
        />
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-8 z-30 w-52 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          <Item
            onClick={() => {
              setExpanded((p) => new Set(p).add(suite.id));
              setCreating({ parent: suite.id });
              setOpenMenu(null);
            }}
          >
            Add subfolder
          </Item>
          <Item
            onClick={() => {
              setRenaming(suite.id);
              setOpenMenu(null);
            }}
          >
            Rename
          </Item>
          <Item
            onClick={() => {
              setOpenMenu(null);
              if (
                confirm(
                  `Delete “${suite.name}” and all its subfolders and cases?`
                )
              ) {
                run(() => removeSuite(projectId, suite.id));
              }
            }}
          >
            Delete
          </Item>
          <Divider />
          <Item
            onClick={() => {
              expandSubtree(suite.id, true);
              setOpenMenu(null);
            }}
          >
            Expand all
          </Item>
          <Item
            onClick={() => {
              expandSubtree(suite.id, false);
              setOpenMenu(null);
            }}
          >
            Collapse all
          </Item>
          <Divider />
          <Item disabled>Create test cycle (Phase 2)</Item>
          <Divider />
          <Item onClick={() => copy(suite.id)}>
            <span className="text-muted">ID</span>
            <span className="truncate font-mono text-xs text-subtle">
              {suite.id.slice(0, 8)}…
            </span>
          </Item>
          <Item
            onClick={() =>
              copy(
                `${window.location.origin}/projects/${projectId}?folder=${suite.id}`
              )
            }
          >
            Copy folder link
          </Item>
        </div>
      </>
    );
  }

  const roots = childrenOf.get(null) ?? [];
  const scopeName = archivedView
    ? "Archived test cases"
    : selectedSuite
      ? suites.find((s) => s.id === selectedSuite)?.name ?? "Folder"
      : "All test cases";

  return (
    <div
      ref={containerRef}
      style={{ "--left-w": `${leftWidth}px` } as React.CSSProperties}
      className="grid min-h-0 grid-cols-1 gap-4 lg:flex-1 lg:grid-cols-[var(--left-w)_1rem_minmax(0,1fr)] lg:gap-0"
    >
      {/* ---------------- Left panel ---------------- */}
      <aside className="card animate-fade flex min-h-0 max-h-[70dvh] flex-col p-3 lg:h-full lg:max-h-none">
        <div className="mb-2 flex items-center gap-2">
          {searchOpen ? (
            <div className="flex h-8 flex-1 items-center gap-1.5 rounded-md border border-line bg-surface px-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-subtle"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                autoFocus
                value={folderQuery}
                onChange={(e) => setFolderQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    setFolderQuery("");
                  }
                }}
                onBlur={() => {
                  setSearchOpen(false);
                  setFolderQuery("");
                }}
                placeholder="Search folders…"
                className="h-full flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-subtle"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSearchOpen(false);
                  setFolderQuery("");
                }}
                className="shrink-0 rounded p-0.5 text-subtle hover:text-fg"
                aria-label="Close search"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setCreating({ parent: null })}
                className="h-8 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-fg transition-all hover:opacity-90 active:scale-95"
              >
                + New Folder
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-subtle transition-colors hover:bg-surface-muted hover:text-fg"
                aria-label="Search folders"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* All test cases + top-level drop target (un-nest) */}
          <div
            onClick={() => selectFolder(null)}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget("root");
            }}
            onDragLeave={() => setDropTarget((d) => (d === "root" ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              try {
                const d = JSON.parse(e.dataTransfer.getData("application/json"));
                if (d.kind === "suite") run(() => moveSuite(projectId, d.id, null));
              } catch {}
            }}
            className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${
              selectedSuite === null
                ? "bg-primary/10 text-fg"
                : "text-fg hover:bg-surface-muted"
            } ${dropTarget === "root" ? "ring-2 ring-ring ring-inset" : ""}`}
          >
            <span>All test cases</span>
            <span className="text-xs font-normal text-subtle">
              {totalCount}
            </span>
          </div>

          <ul className="mt-1">
            {roots.map((s) => (
              <FolderNode key={s.id} suite={s} depth={0} />
            ))}
          </ul>

          {/* top-level inline create */}
          {creating?.parent === null && (
            <FolderInput
              onSubmit={(name) =>
                run(async () => {
                  await addSuite(projectId, name, null);
                  setCreating(null);
                })
              }
              onCancel={() => setCreating(null)}
            />
          )}

          {roots.length === 0 && !creating && (
            <p className="px-2 py-3 text-xs text-subtle">
              No folders yet. Create one to start.
            </p>
          )}
        </div>

        {/* Archived */}
        <div className="mt-2 border-t border-line pt-2">
          <div
            onClick={() => selectFolder(ARCHIVED)}
            className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
              archivedView
                ? "bg-primary/10 text-fg"
                : "text-muted hover:bg-surface-muted hover:text-fg"
            }`}
          >
            <span>🗄 Archived test cases</span>
            <span className="text-xs text-subtle">{archivedCount}</span>
          </div>
        </div>
      </aside>

      {/* ---------------- Resizer ---------------- */}
      <div
        onMouseDown={() => setResizing(true)}
        onDoubleClick={() => setLeftWidth(DEFAULT_LEFT)}
        title="Drag to resize · double-click to reset"
        className="group hidden cursor-col-resize items-center justify-center lg:flex"
      >
        <div
          className={`h-16 w-1 rounded-full transition-colors ${
            resizing ? "bg-ring" : "bg-line group-hover:bg-ring"
          }`}
        />
      </div>

      {/* ---------------- Right panel ---------------- */}
      <section className="card animate-fade flex min-h-[24rem] flex-col lg:h-full lg:min-h-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-fg">{scopeName}</h2>
            <p className="text-xs text-subtle">
              {total} case{total === 1 ? "" : "s"}
              {loading ? " · loading…" : pending ? " · saving…" : ""}
            </p>
          </div>
          <input
            value={caseQuery}
            onChange={(e) => onCaseSearch(e.target.value)}
            placeholder="Search cases…"
            className="field h-8 w-44 px-2 py-1 text-xs"
          />
          {!archivedView && (
            <NewCaseModal
              projectId={projectId}
              suiteOptions={suites
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => ({ id: s.id, label: s.name }))}
              defaultSuiteId={selectedSuite ?? undefined}
            />
          )}
        </div>

        {/* Selection action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-3 py-2 text-sm">
            <span className="font-medium text-fg">{selected.size} selected</span>
            {archivedView ? (
              <button
                onClick={() =>
                  run(async () => {
                    await archiveCases(projectId, selectedIds, false);
                    setSelected(new Set());
                  })
                }
                className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-muted"
              >
                Restore
              </button>
            ) : (
              <>
                <button
                  onClick={() =>
                    run(async () => {
                      await cloneCases(projectId, selectedIds);
                      setSelected(new Set());
                    })
                  }
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-muted"
                >
                  Clone
                </button>
                <button
                  onClick={() =>
                    run(async () => {
                      await archiveCases(projectId, selectedIds, true);
                      setSelected(new Set());
                    })
                  }
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-muted"
                >
                  Archive
                </button>
              </>
            )}
            <div className="relative">
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-muted"
              >
                Export ▾
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
                  <button
                    onClick={() => doExport("xlsx")}
                    className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-muted"
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => doExport("csv")}
                    className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-muted"
                  >
                    CSV (.csv)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-subtle hover:text-fg"
            >
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-auto">
          <div
            className={
              loading
                ? "pointer-events-none select-none opacity-40 transition-opacity"
                : "transition-opacity"
            }
          >
          {rows.length === 0 && !loading ? (
            <p className="p-6 text-sm text-subtle">
              {archivedView
                ? "No archived test cases."
                : selectedSuite
                  ? "No test cases here. Add one with “New test case”."
                  : "No test cases yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  {(
                    [
                      ["key", "Key"],
                      ["title", "Name"],
                      ["priority", "Priority"],
                      ["status", "Status"],
                    ] as [SortField, string][]
                  ).map(([field, label]) => (
                    <th key={field} className="px-2 py-2 text-left font-semibold">
                      <button
                        onClick={() => onSort(field)}
                        className="inline-flex items-center gap-1 transition-colors hover:text-fg"
                      >
                        {label}
                        <span className="text-[10px] text-subtle">
                          {sortField === field
                            ? sortDir === "asc"
                              ? "▲"
                              : "▼"
                            : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
<tr
                    key={c.id}
                    draggable={!archivedView}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({ kind: "case", id: c.id })
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={`border-t border-line transition-colors hover:bg-surface-muted ${
                      selected.has(c.id) ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.title}`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {c.key ?? c.sourceKey ? (
                        <Link
                          href={`/projects/${projectId}/cases/${c.key ?? c.id}`}
                          className="font-mono text-xs text-ring hover:underline"
                        >
                          {c.key ?? c.sourceKey}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/projects/${projectId}/cases/${c.key ?? c.id}`}
                        className="text-fg hover:text-ring hover:underline"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-2 py-2">
                      <CaseStatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
          </div>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/50 backdrop-blur-[1px]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-ring" />
            </div>
          )}
        </div>

        {/* Footer / pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-subtle">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
              {total}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => goToPage(page - 1)}
                  className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span>
                  {page + 1}/{pageCount}
                </span>
                <button
                  disabled={page >= pageCount - 1}
                  onClick={() => goToPage(page + 1)}
                  className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
