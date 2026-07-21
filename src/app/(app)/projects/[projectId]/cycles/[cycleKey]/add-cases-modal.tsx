"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { addCasesToCycle } from "@/lib/actions/cycles";
import { ArrowLeft, ChevronRight } from "@/components/icons";

type CaseLite = { id: string; title: string; key: string | null };
const PAGE = 50;

export function AddCasesModal({
  projectId,
  cycleId,
  existingCaseIds,
  onAdded,
}: {
  projectId: string;
  cycleId: string;
  existingCaseIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CaseLite[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const existing = new Set(existingCaseIds);

  async function load(query: string, pageVal: number) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("page", String(pageVal));
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
    load("", 0);
  }
  async function confirm() {
    if (sel.size === 0) return;
    setBusy(true);
    await addCasesToCycle(cycleId, [...sel]);
    setBusy(false);
    setOpen(false);
    onAdded();
  }

  return (
    <>
      <button
        onClick={openModal}
        className="btn btn-primary shrink-0"
      >
        + Add test cases
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add test cases to cycle"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
              load(e.target.value, 0);
            }}
            placeholder="Search cases by name or key…"
            className="field"
          />
          <div className="max-h-80 overflow-y-auto rounded-md border border-line">
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
                  <span className="w-20 shrink-0 font-mono text-xs text-subtle">
                    {c.key ?? "—"}
                  </span>
                  <span className="flex-1 truncate text-fg">{c.title}</span>
                  {added && <span className="text-xs text-subtle">added</span>}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-subtle">
            <span>
              {total} case{total === 1 ? "" : "s"}
              {loading ? " · loading…" : ""}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => {
                  const p = page - 1;
                  setPage(p);
                  load(q, p);
                }}
                className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
              >
                <ArrowLeft size={14} /> Prev
              </button>
              <button
                disabled={(page + 1) * PAGE >= total}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  load(q, p);
                }}
                className="rounded px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button
              onClick={() => setOpen(false)}
              className="btn btn-secondary"
            >
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
        </div>
      </Modal>
    </>
  );
}
