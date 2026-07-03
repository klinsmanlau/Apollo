"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ImportSummary } from "@/lib/import/run";

type Status = "idle" | "preparing" | "importing" | "done" | "error";

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function ImportForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const eta =
    status === "importing" && done > 0 && done < total
      ? ((total - done) / done) * elapsed
      : 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("error");
      setError("Please choose a file to import");
      return;
    }

    setStatus("preparing");
    setError(null);
    setSummary(null);
    setDone(0);
    setTotal(0);

    let res: Response;
    try {
      res = await fetch(`/api/projects/${projectId}/import`, {
        method: "POST",
        body: fd,
      });
    } catch {
      setStatus("error");
      setError("Network error — could not reach the server.");
      return;
    }

    if (!res.ok || !res.body) {
      const msg = await res.json().catch(() => null);
      setStatus("error");
      setError(msg?.error ?? "Import failed.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === "start") {
            setTotal(msg.total);
            setStartedAt(Date.now());
            setStatus("importing");
          } else if (msg.type === "progress") {
            setDone(msg.done);
            setTotal(msg.total);
          } else if (msg.type === "done") {
            setSummary(msg.summary);
            setDone(msg.summary.total);
            setStatus("done");
          } else if (msg.type === "error") {
            setError(msg.error);
            setStatus("error");
          }
        }
      }
    } catch {
      setStatus("error");
      setError("Import stream interrupted.");
    }
  }

  const busy = status === "preparing" || status === "importing";

  return (
    <div className="space-y-5">
      {status !== "done" && (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">
              Zephyr Scale export (.xlsx)
            </label>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              disabled={busy}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-fg hover:file:opacity-90 disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-muted">
              Folders become nested suites; priority, labels, steps, and custom
              fields are mapped automatically. Re-importing updates cases matched
              by their Zephyr <span className="font-mono">Key</span>.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </form>
      )}

      {/* Progress tracker */}
      {busy && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-fg">
              {status === "preparing"
                ? "Uploading & parsing…"
                : `Importing ${done.toLocaleString()} / ${total.toLocaleString()}`}
            </span>
            {status === "importing" && (
              <span className="text-muted">
                {pct}% · ETA {formatEta(eta)}
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full bg-primary transition-all duration-200 ${
                status === "preparing" ? "w-1/3 animate-pulse" : ""
              }`}
              style={status === "importing" ? { width: `${pct}%` } : undefined}
            />
          </div>
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {status === "done" && summary && (
        <div className="animate-rise space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-500/30 dark:bg-green-500/10">
          <p className="font-semibold text-green-800 dark:text-green-300">
            Import complete ✓
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-green-900 dark:text-green-200 sm:grid-cols-4">
            <li>
              <span className="text-2xl font-bold">{summary.created}</span>
              <br />
              cases created
            </li>
            <li>
              <span className="text-2xl font-bold">{summary.updated}</span>
              <br />
              cases updated
            </li>
            <li>
              <span className="text-2xl font-bold">{summary.suitesCreated}</span>
              <br />
              suites created
            </li>
            <li>
              <span className="text-2xl font-bold">{summary.skipped}</span>
              <br />
              rows skipped
            </li>
          </ul>
          {summary.unmappedHeaders.length > 0 && (
            <p className="text-xs text-green-800 dark:text-green-300">
              Custom columns stored in each case&apos;s custom-fields:{" "}
              {summary.unmappedHeaders.join(", ")}
            </p>
          )}
          {onDone ? (
            <button
              onClick={onDone}
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98]"
            >
              View imported cases →
            </button>
          ) : (
            <Link
              href={`/projects/${projectId}`}
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90"
            >
              View imported cases →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
