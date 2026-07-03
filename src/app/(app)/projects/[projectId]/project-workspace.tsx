"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Priority, CaseType, CaseStatus } from "@prisma/client";
import { PriorityBadge, TypeBadge } from "@/components/ui";
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
  sourceKey: string | null;
  priority: Priority;
  type: CaseType;
  status: CaseStatus;
  suiteId: string;
};

type Drag = { kind: "case"; id: string } | { kind: "suite"; id: string } | null;

const PAGE_SIZE = 50;
const ARCHIVED = "__archived__";

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
  cases,
  archivedCases,
  initialFolder,
}: {
  projectId: string;
  suites: WSuite[];
  cases: WCase[];
  archivedCases: WCase[];
  initialFolder: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedSuite, setSelectedSuite] = useState<string | null>(
    initialFolder && suites.some((s) => s.id === initialFolder)
      ? initialFolder
      : null
  );
  const [folderQuery, setFolderQuery] = useState("");
  const [caseQuery, setCaseQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(suites.map((s) => s.id))
  );
  const [page, setPage] = useState(0);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Inline folder creation: { parent } where parent null = top level.
  const [creating, setCreating] = useState<{ parent: string | null } | null>(
    null
  );

  const archivedView = selectedSuite === ARCHIVED;

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

  const casesBySuite = useMemo(() => {
    const m = new Map<string, WCase[]>();
    for (const c of cases) {
      const arr = m.get(c.suiteId) ?? [];
      arr.push(c);
      m.set(c.suiteId, arr);
    }
    return m;
  }, [cases]);

  const countFor = (suiteId: string) => {
    let n = 0;
    for (const id of subtreeOf.get(suiteId) ?? [suiteId]) {
      n += casesBySuite.get(id)?.length ?? 0;
    }
    return n;
  };

  // ---- right-panel case list -------------------------------------------
  const visibleCases = useMemo(() => {
    const source = archivedView
      ? archivedCases
      : selectedSuite
        ? cases.filter((c) => subtreeOf.get(selectedSuite)?.has(c.suiteId))
        : cases;
    const q = caseQuery.trim().toLowerCase();
    return q
      ? source.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            (c.sourceKey ?? "").toLowerCase().includes(q)
        )
      : source;
  }, [cases, archivedCases, archivedView, selectedSuite, subtreeOf, caseQuery]);

  const pageCount = Math.max(1, Math.ceil(visibleCases.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageCases = visibleCases.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  const allVisibleSelected =
    pageCases.length > 0 && pageCases.every((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) pageCases.forEach((c) => next.delete(c.id));
      else pageCases.forEach((c) => next.add(c.id));
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
  }

  // ---- server ops ------------------------------------------------------
  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
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
    const ids = selectedIds.length > 0 ? selectedIds : visibleCases.map((c) => c.id);
    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, format }),
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
    const open = expanded.has(suite.id);
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
                className="w-4 shrink-0 text-subtle"
              >
                {open ? "▾" : "▸"}
              </button>
            ) : (
              <span className="w-4 shrink-0 text-center text-subtle">•</span>
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
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* ---------------- Left panel ---------------- */}
      <aside className="card animate-fade flex max-h-[calc(100vh-8rem)] flex-col p-3">
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => {
              setCreating({ parent: null });
            }}
            className="h-8 flex-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-fg transition-all hover:opacity-90 active:scale-95"
          >
            + New Folder
          </button>
          <input
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
            placeholder="Search…"
            className="field h-8 w-28 px-2 py-1 text-xs"
          />
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
              {cases.length}
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
            <span className="text-xs text-subtle">{archivedCases.length}</span>
          </div>
        </div>
      </aside>

      {/* ---------------- Right panel ---------------- */}
      <section className="card animate-fade flex min-h-[24rem] flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-fg">{scopeName}</h2>
            <p className="text-xs text-subtle">
              {visibleCases.length} case{visibleCases.length === 1 ? "" : "s"}
              {pending && " · saving…"}
            </p>
          </div>
          <input
            value={caseQuery}
            onChange={(e) => {
              setCaseQuery(e.target.value);
              setPage(0);
            }}
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
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleCases.length === 0 ? (
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
                  <th className="px-2 py-2 text-left font-semibold">Key</th>
                  <th className="px-2 py-2 text-left font-semibold">Name</th>
                  <th className="px-2 py-2 text-left font-semibold">Priority</th>
                  <th className="px-2 py-2 text-left font-semibold">Type</th>
                  <th className="px-2 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageCases.map((c) => (
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
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-subtle">
                      {c.sourceKey ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/projects/${projectId}/cases/${c.id}`}
                        className="text-fg hover:text-ring hover:underline"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-2 py-2">
                      <TypeBadge type={c.type} />
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / pagination */}
        {visibleCases.length > 0 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-subtle">
            <span>
              {safePage * PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * PAGE_SIZE, visibleCases.length)} of{" "}
              {visibleCases.length}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span>
                  {safePage + 1}/{pageCount}
                </span>
                <button
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
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
