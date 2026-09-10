"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CycleRow } from "@/lib/cycles-query";
import { cloneCycles, deleteCycles, addCycleFolder, moveCycle, moveCycleFolder, renameCycleFolder, removeCycleFolder } from "@/lib/actions/cycles";
import { NewCycleModal, type CycleUser } from "./new-cycle-modal";
import { RefreshButton } from "@/components/refresh-button";
import { useConfirm } from "@/components/confirm-dialog";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Play } from "@/components/icons";

export type WFolder = { id: string; name: string; parentFolderId: string | null };

const PAGE_SIZE = 50;
type SortField = "key" | "name";
type SortDir = "asc" | "desc";

const STATUS_STYLES: Record<CycleRow["status"], string> = {
  not_executed: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  done: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
};
const STATUS_LABEL: Record<CycleRow["status"], string> = {
  not_executed: "Not executed",
  in_progress: "In progress",
  done: "Done",
};

function ProgressBar({ c }: { c: CycleRow }) {
  // Proportional bar: each status fills its share of the total, so e.g. a run
  // with passes + in-progress shows green + amber side by side. Colors match
  // the execution palette (pass=green, fail=red, blocked=blue, in progress=amber).
  const pct = (n: number) => (c.total > 0 ? (n / c.total) * 100 : 0);
  const segments = [
    { key: "pass", w: pct(c.passed), cls: "bg-green-500" },
    { key: "pass_auto", w: pct(c.passedAuto), cls: "bg-green-800" },
    { key: "fail", w: pct(c.failed), cls: "bg-red-500" },
    { key: "blocked", w: pct(c.blocked), cls: "bg-blue-500" },
    { key: "in_progress", w: pct(c.inProgress), cls: "bg-amber-500" },
  ].filter((s) => s.w > 0);
  const title = `${c.passed} passed · ${c.passedAuto} pass [A] · ${c.failed} failed · ${c.blocked} blocked · ${c.inProgress} in progress · ${c.total} total`;
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-2 w-28 overflow-hidden rounded-full bg-surface-muted"
        title={title}
      >
        {segments.map((s) => (
          <div key={s.key} className={`h-full ${s.cls}`} style={{ width: `${s.w}%` }} />
        ))}
      </div>
      <span className="w-9 text-right text-xs text-muted">{c.progress}%</span>
    </div>
  );
}

export function CycleWorkspace({
  projectId,
  folders,
  directCounts,
  initialCycles,
  initialTotal,
  initialFolder,
  users,
  canEdit = true,
  canDelete = true,
}: {
  projectId: string;
  folders: WFolder[];
  directCounts: Record<string, number>;
  initialCycles: CycleRow[];
  initialTotal: number;
  initialFolder: string | null;
  users: CycleUser[];
  /** lead+ — create/clone cycles and folders. */
  canEdit?: boolean;
  /** admin — destructive deletes. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CycleRow[]>(initialCycles);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialFolder);
  const [folderQuery, setFolderQuery] = useState("");
  const [cycleQuery, setCycleQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  // Folder create target: undefined = closed, null = new root folder, string = new subfolder under that folder id.
  const [createParent, setCreateParent] = useState<string | null | undefined>(undefined);
  // Drag-and-drop: current drop target for highlight (folder id or "root").
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const sortRef = useRef<{ field: SortField | null; dir: SortDir }>({ field: null, dir: "asc" });
  const { confirm, dialog } = useConfirm();

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, WFolder[]>();
    for (const f of folders) {
      const arr = m.get(f.parentFolderId) ?? [];
      arr.push(f);
      m.set(f.parentFolderId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [folders]);

  const subtreeOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const collect = (id: string): Set<string> => {
      if (m.has(id)) return m.get(id)!;
      const set = new Set<string>([id]);
      for (const ch of childrenOf.get(id) ?? []) for (const d of collect(ch.id)) set.add(d);
      m.set(id, set);
      return set;
    };
    for (const f of folders) collect(f.id);
    return m;
  }, [folders, childrenOf]);

  const totalCount = useMemo(
    () => Object.values(directCounts).reduce((a, b) => a + b, 0),
    [directCounts]
  );
  const countFor = (id: string) => {
    let n = 0;
    for (const d of subtreeOf.get(id) ?? [id]) n += directCounts[d] ?? 0;
    return n;
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function load(
    folderVal: string | null,
    q: string,
    pageVal: number,
    sort: SortField | null = sortRef.current.field,
    dir: SortDir = sortRef.current.dir
  ) {
    loadAbort.current?.abort();
    const ac = new AbortController();
    loadAbort.current = ac;
    setLoading(true);
    const params = new URLSearchParams();
    if (folderVal) params.set("folderIds", [...(subtreeOf.get(folderVal) ?? [folderVal])].join(","));
    if (q.trim()) params.set("q", q.trim());
    params.set("page", String(pageVal));
    if (sort) {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/cycles?${params}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (res.ok && loadAbort.current === ac) {
        const data = (await res.json()) as { cycles: CycleRow[]; total: number };
        setRows(data.cycles);
        setTotal(data.total);
      }
    } catch {
      /* aborted */
    } finally {
      if (loadAbort.current === ac) setLoading(false);
    }
  }

  function selectFolder(id: string | null) {
    setSelectedFolder(id);
    setPage(0);
    setSelected(new Set());
    load(id, cycleQuery, 0);
  }
  function onSearch(v: string) {
    setCycleQuery(v);
    setPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(selectedFolder, v, 0), 300);
  }
  function goToPage(p: number) {
    const clamped = Math.min(Math.max(0, p), pageCount - 1);
    setPage(clamped);
    load(selectedFolder, cycleQuery, clamped);
  }
  function onSort(field: SortField) {
    const prev = sortRef.current;
    const dir: SortDir = prev.field === field && prev.dir === "asc" ? "desc" : "asc";
    sortRef.current = { field, dir };
    setSortField(field);
    setSortDir(dir);
    setPage(0);
    load(selectedFolder, cycleQuery, 0, field, dir);
  }
  function run(fn: () => Promise<unknown>) {
    (async () => {
      await fn();
      await load(selectedFolder, cycleQuery, page);
      router.refresh();
    })();
  }
  // Re-pull the current view (latest cycle statuses/progress) + server tree.
  async function refresh() {
    await load(selectedFolder, cycleQuery, page);
    router.refresh();
  }

  // Drop the currently-dragged cycle(s) or folder into a target folder
  // (targetId = null means the top level). Reparent-only; the server actions
  // validate the move (and reject folder-into-own-subtree).
  function applyDrop(
    e: { preventDefault: () => void; dataTransfer: DataTransfer },
    targetId: string | null
  ) {
    e.preventDefault();
    setDropTarget(null);
    let d: { kind: "cycle" | "folder"; id: string } | null = null;
    try {
      d = JSON.parse(e.dataTransfer.getData("application/json"));
    } catch {}
    if (!d) return;
    if (d.kind === "cycle") {
      // If the dragged cycle is part of a multi-selection, move them all.
      const ids = selected.has(d.id) && selected.size > 1 ? [...selected] : [d.id];
      run(async () => {
        await Promise.all(ids.map((id) => moveCycle(projectId, id, targetId)));
        setSelected(new Set());
      });
    } else {
      if (d.id === targetId) return; // dropped onto itself — no-op
      run(() => moveCycleFolder(projectId, d.id, targetId));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    setOpenMenu(null);
  }
  // Expand or collapse a folder and all of its descendants.
  function expandSubtree(id: string, open: boolean) {
    const ids = [...(subtreeOf.get(id) ?? [id])];
    setExpanded((p) => {
      const n = new Set(p);
      for (const x of ids) open ? n.add(x) : n.delete(x);
      return n;
    });
  }

  const selectedIds = [...selected];
  const roots = childrenOf.get(null) ?? [];
  const scopeName = selectedFolder
    ? folders.find((f) => f.id === selectedFolder)?.name ?? "Folder"
    : "All test cycles";

  function FolderNode({ folder, depth }: { folder: WFolder; depth: number }) {
    const kids = childrenOf.get(folder.id) ?? [];
    const isSelected = selectedFolder === folder.id;
    const open = !!folderQuery.trim() || expanded.has(folder.id);
    const match =
      !folderQuery.trim() ||
      [...(subtreeOf.get(folder.id) ?? [])].some((id) =>
        folders.find((x) => x.id === id)?.name.toLowerCase().includes(folderQuery.toLowerCase())
      );
    if (!match) return null;
    return (
      <li>
        {renaming === folder.id ? (
          <div style={{ paddingLeft: `${depth * 14 + 6}px` }}>
            <FolderCreate
              initial={folder.name}
              onSubmit={(name) =>
                run(async () => {
                  await renameCycleFolder(projectId, folder.id, name);
                  setRenaming(null);
                })
              }
              onDone={() => setRenaming(null)}
            />
          </div>
        ) : (
        <div
          onClick={() => selectFolder(folder.id)}
          draggable={canEdit}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({ kind: "folder", id: folder.id })
            );
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDropTarget(null)}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dropTarget !== folder.id) setDropTarget(folder.id);
          }}
          onDragLeave={() => setDropTarget((t) => (t === folder.id ? null : t))}
          onDrop={(e) => {
            e.stopPropagation();
            applyDrop(e, folder.id);
          }}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group relative flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-1 text-sm transition-colors ${
            dropTarget === folder.id
              ? "bg-primary/10 text-fg ring-1 ring-ring"
              : isSelected
              ? "bg-primary/10 text-fg"
              : "text-muted hover:bg-surface-muted hover:text-fg"
          }`}
        >
          {kids.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((p) => {
                  const n = new Set(p);
                  n.has(folder.id) ? n.delete(folder.id) : n.add(folder.id);
                  return n;
                });
              }}
              className="flex w-5 shrink-0 items-center justify-center text-base leading-none text-subtle"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-5 shrink-0 text-center text-subtle">•</span>
          )}
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto shrink-0 text-xs text-subtle group-hover:hidden">
            {countFor(folder.id)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenu(openMenu === folder.id ? null : folder.id);
            }}
            className={`ml-auto hidden h-6 w-6 shrink-0 items-center justify-center rounded text-subtle hover:bg-surface hover:text-fg group-hover:flex ${
              openMenu === folder.id ? "!flex bg-surface text-fg" : ""
            }`}
            aria-label="Folder options"
          >
            ⋯
          </button>
          {openMenu === folder.id && <FolderMenu folder={folder} depth={depth} />}
        </div>
        )}
        {(createParent === folder.id || (open && kids.length > 0)) && (
          <ul>
            {open &&
              kids.map((k) => (
                <FolderNode key={k.id} folder={k} depth={depth + 1} />
              ))}
            {createParent === folder.id && (
              <li style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }}>
                <FolderCreate
                  onSubmit={(name) => run(() => addCycleFolder(projectId, name, folder.id))}
                  onDone={() => setCreateParent(undefined)}
                />
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }

  function FolderMenu({ folder }: { folder: WFolder; depth: number }) {
    const hasKids = (subtreeOf.get(folder.id)?.size ?? 1) > 1;
    const Item = ({
      onClick,
      children,
      disabled,
    }: {
      onClick?: () => void;
      children: ReactNode;
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
          {canEdit && (
            <>
              <Item
                onClick={() => {
                  setExpanded((p) => new Set(p).add(folder.id));
                  setCreateParent(folder.id);
                  setOpenMenu(null);
                }}
              >
                Add subfolder
              </Item>
              <Item
                onClick={() => {
                  setRenaming(folder.id);
                  setOpenMenu(null);
                }}
              >
                Rename
              </Item>
            </>
          )}
          {canDelete && (
            <Item
              onClick={() => {
                setOpenMenu(null);
                confirm({
                  title: "Delete folder",
                  body: (
                    <>
                      Delete <strong className="text-fg">{folder.name}</strong> and
                      all of its subfolders? This can&rsquo;t be undone.
                    </>
                  ),
                  confirmLabel: "Delete folder",
                  destructive: true,
                  onConfirm: () => run(() => removeCycleFolder(projectId, folder.id)),
                });
              }}
            >
              Delete
            </Item>
          )}
          {(canEdit || canDelete) && <Divider />}
          <Item
            disabled={!hasKids}
            onClick={() => {
              expandSubtree(folder.id, true);
              setOpenMenu(null);
            }}
          >
            Expand all
          </Item>
          <Item
            disabled={!hasKids}
            onClick={() => {
              expandSubtree(folder.id, false);
              setOpenMenu(null);
            }}
          >
            Collapse all
          </Item>
          <Divider />
          <Item onClick={() => copy(folder.id)}>
            <span className="text-muted">ID</span>
            <span className="truncate font-mono text-xs text-subtle">
              {folder.id.slice(0, 8)}…
            </span>
          </Item>
          <Item
            onClick={() =>
              copy(`${window.location.origin}/projects/${projectId}/cycles?folder=${folder.id}`)
            }
          >
            Copy folder link
          </Item>
        </div>
      </>
    );
  }

  return (
    <div className="grid min-h-0 grid-cols-1 gap-4 lg:flex-1 lg:grid-cols-[300px_1rem_minmax(0,1fr)] lg:gap-0">
      {/* Left panel */}
      <aside className="card flex min-h-0 max-h-[70dvh] flex-col p-3 lg:h-full lg:max-h-none">
        <div className="mb-2 flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setCreateParent(null)}
              className="btn btn-sm btn-primary h-8 shrink-0 px-3"
            >
              + New Folder
            </button>
          )}
          <input
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
            placeholder="Search…"
            className="field h-8 flex-1 px-2 py-1 text-xs"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            onClick={() => selectFolder(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dropTarget !== "root") setDropTarget("root");
            }}
            onDragLeave={() => setDropTarget((t) => (t === "root" ? null : t))}
            onDrop={(e) => {
              applyDrop(e, null);
            }}
            className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${
              dropTarget === "root"
                ? "bg-primary/10 text-fg ring-1 ring-ring"
                : selectedFolder === null
                ? "bg-primary/10 text-fg"
                : "text-fg hover:bg-surface-muted"
            }`}
          >
            <span>All test cycles</span>
            <span className="text-xs font-normal text-subtle">{totalCount}</span>
          </div>
          <ul className="mt-1">
            {roots.map((f) => (
              <FolderNode key={f.id} folder={f} depth={0} />
            ))}
          </ul>
          {createParent === null && (
            <FolderCreate
              onSubmit={(name) => run(() => addCycleFolder(projectId, name, null))}
              onDone={() => setCreateParent(undefined)}
            />
          )}
        </div>
      </aside>

      {/* Resizer spacer (static) */}
      <div className="hidden lg:block" />

      {/* Right panel */}
      <section className="card flex min-h-[24rem] flex-col lg:h-full lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-fg">{scopeName}</h2>
            <p className="text-xs text-subtle">
              {total} cycle{total === 1 ? "" : "s"}
              {loading ? " · loading…" : ""}
            </p>
          </div>
          <input
            value={cycleQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search cycles…"
            className="field h-8 w-44 px-2 py-1 text-xs"
          />
          <RefreshButton onRefresh={refresh} title="Refresh cycles" />
          {canEdit && (
          <NewCycleModal
            projectId={projectId}
            folderOptions={folders
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => ({ id: f.id, label: f.name }))}
            defaultFolderId={selectedFolder ?? undefined}
            users={users}
          />
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-3 py-2 text-sm">
            <span className="font-medium text-fg">{selected.size} selected</span>
            {canEdit && (
              <button
                onClick={() =>
                  run(async () => {
                    await cloneCycles(projectId, selectedIds);
                    setSelected(new Set());
                  })
                }
                className="btn btn-sm btn-secondary"
              >
                Clone
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  confirm({
                    title: "Delete test cycles",
                    body: `Delete ${selected.size} test cycle${selected.size === 1 ? "" : "s"} and their recorded results? This can't be undone.`,
                    confirmLabel: "Delete",
                    destructive: true,
                    onConfirm: () =>
                      run(async () => {
                        await deleteCycles(projectId, selectedIds);
                        setSelected(new Set());
                      }),
                  });
                }}
                className="rounded-md border border-red-200 bg-surface px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400"
              >
                Delete
              </button>
            )}
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-subtle hover:text-fg">
              Clear
            </button>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-auto">
            <div className={loading ? "pointer-events-none opacity-40" : ""}>
              {rows.length === 0 && !loading ? (
                <p className="p-6 text-sm text-subtle">No test cycles here.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-muted text-xs uppercase tracking-wide text-subtle">
                    <tr>
                      <th className="w-8 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() =>
                            setSelected((prev) => {
                              const n = new Set(prev);
                              allSelected ? rows.forEach((r) => n.delete(r.id)) : rows.forEach((r) => n.add(r.id));
                              return n;
                            })
                          }
                        />
                      </th>
                      <th className="w-8 px-1 py-2" />
                      <th className="px-2 py-2 text-left font-semibold">
                        <button onClick={() => onSort("key")} className="hover:text-fg">
                          Key {sortField === "key" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                        </button>
                      </th>
                      <th className="px-2 py-2 text-left font-semibold">
                        <button onClick={() => onSort("name")} className="hover:text-fg">
                          Name {sortField === "name" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                        </button>
                      </th>
                      <th className="px-2 py-2 text-left font-semibold">Progress</th>
                      <th className="px-2 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/json",
                            JSON.stringify({ kind: "cycle", id: r.id })
                          );
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDropTarget(null)}
                        className={`border-t border-line transition-colors hover:bg-surface-muted ${
                          canEdit ? "cursor-grab" : ""
                        } ${selected.has(r.id) ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const n = new Set(prev);
                                n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="px-1 py-2">
                          <Link
                            href={`/projects/${projectId}/cycles/${r.key ?? r.id}`}
                            className="text-muted hover:text-fg"
                            title="Run cycle"
                          >
                            <Play size={12} />
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <Link
                            href={`/projects/${projectId}/cycles/${r.key ?? r.id}`}
                            className="font-mono text-xs text-ring hover:underline"
                          >
                            {r.key ?? "—"}
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            href={`/projects/${projectId}/cycles/${r.key ?? r.id}`}
                            className="text-fg hover:text-ring hover:underline"
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          <ProgressBar c={r} />
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/50">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-ring" />
            </div>
          )}
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-subtle">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => goToPage(page - 1)}
                  className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  <ArrowLeft size={14} /> Prev
                </button>
                <span>
                  {page + 1}/{pageCount}
                </span>
                <button
                  disabled={page >= pageCount - 1}
                  onClick={() => goToPage(page + 1)}
                  className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {dialog}
    </div>
  );
}

function FolderCreate({
  onSubmit,
  onDone,
  initial = "",
}: {
  onSubmit: (name: string) => void;
  onDone: () => void;
  initial?: string;
}) {
  const [v, setV] = useState(initial);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          onSubmit(v.trim());
          onDone();
        } else if (e.key === "Escape") onDone();
      }}
      onBlur={onDone}
      placeholder="Folder name"
      className="field mt-1 h-7 w-full px-2 py-0 text-xs"
    />
  );
}
