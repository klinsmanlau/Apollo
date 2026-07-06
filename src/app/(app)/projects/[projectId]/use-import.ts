"use client";

import { useState } from "react";
import type { ImportSummary } from "@/lib/import/run";

export type ImportStatus =
  | "idle"
  | "preparing"
  | "importing"
  | "done"
  | "error";

export type UseImport = {
  status: ImportStatus;
  done: number;
  total: number;
  pct: number;
  eta: number;
  summary: ImportSummary | null;
  error: string | null;
  busy: boolean;
  start: (file: File) => Promise<void>;
  reset: () => void;
};

/**
 * Runs a streaming Zephyr import and tracks its progress. Kept as a hook so the
 * state can live above the modal — the import then survives the modal closing
 * and can be surfaced in a background progress bar. `onComplete` fires once the
 * import finishes (used to refresh the page data).
 */
export function useImport(
  projectId: string,
  onComplete?: () => void
): UseImport {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(file: File) {
    setStatus("preparing");
    setError(null);
    setSummary(null);
    setDone(0);
    setTotal(0);

    const fd = new FormData();
    fd.append("file", file);

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
            onComplete?.();
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

  function reset() {
    setStatus("idle");
    setSummary(null);
    setError(null);
    setDone(0);
    setTotal(0);
    setStartedAt(0);
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const eta =
    status === "importing" && done > 0 && done < total
      ? ((total - done) / done) * elapsed
      : 0;
  const busy = status === "preparing" || status === "importing";

  return { status, done, total, pct, eta, summary, error, busy, start, reset };
}

export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
