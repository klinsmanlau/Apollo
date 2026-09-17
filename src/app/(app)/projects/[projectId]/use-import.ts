"use client";

import { useState } from "react";
import type { ImportSummary } from "@/lib/import/run";

export type ImportStatus =
  | "idle"
  | "preparing"
  | "mapping"
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
  // ---- field-mapping step ----
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  mapping: Record<string, string>;
  nameMapped: boolean;
  preflight: (file: File) => Promise<void>;
  setMap: (header: string, target: string) => void;
  confirm: () => Promise<void>;
  back: () => void;
  reset: () => void;
};

/**
 * Runs a Zephyr import in two phases: a preflight that reads the file's columns
 * so the user can confirm the column → field mapping, then the streaming import
 * itself (with that mapping). Kept as a hook so the state lives above the modal
 * — the import survives the modal closing and can be shown in a background bar.
 * `onComplete` fires once the import finishes (used to refresh the page data).
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

  // Mapping step
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Phase 1: read the file's columns + a sample, then show the mapping step.
  async function preflight(f: File) {
    setStatus("preparing");
    setError(null);
    setSummary(null);
    setDone(0);
    setTotal(0);
    setFile(f);

    const fd = new FormData();
    fd.append("file", f);

    let res: Response;
    try {
      res = await fetch(`/api/projects/${projectId}/import/preflight`, {
        method: "POST",
        body: fd,
      });
    } catch {
      setStatus("error");
      setError("Network error — could not reach the server.");
      return;
    }
    if (!res.ok) {
      const msg = await res.json().catch(() => null);
      setStatus("error");
      setError(msg?.error ?? "Could not read the file.");
      return;
    }
    const data = (await res.json()) as {
      headers: string[];
      sampleRows: string[][];
      rowCount: number;
      suggested: Record<string, string>;
    };
    setHeaders(data.headers);
    setSampleRows(data.sampleRows);
    setRowCount(data.rowCount);
    setMapping(data.suggested);
    setStatus("mapping");
  }

  function setMap(header: string, target: string) {
    setMapping((m) => ({ ...m, [header]: target }));
  }

  // Phase 2: run the streaming import with the confirmed mapping.
  async function confirm() {
    if (!file) return;
    setStatus("preparing");
    setError(null);
    setSummary(null);
    setDone(0);
    setTotal(0);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));

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

  function back() {
    setStatus("idle");
    setError(null);
    setHeaders([]);
    setSampleRows([]);
    setMapping({});
    setFile(null);
  }

  function reset() {
    setStatus("idle");
    setSummary(null);
    setError(null);
    setDone(0);
    setTotal(0);
    setStartedAt(0);
    setFile(null);
    setHeaders([]);
    setSampleRows([]);
    setRowCount(0);
    setMapping({});
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const eta =
    status === "importing" && done > 0 && done < total
      ? ((total - done) / done) * elapsed
      : 0;
  const busy = status === "preparing" || status === "importing";
  const nameMapped = Object.values(mapping).includes("name");

  return {
    status,
    done,
    total,
    pct,
    eta,
    summary,
    error,
    busy,
    headers,
    sampleRows,
    rowCount,
    mapping,
    nameMapped,
    preflight,
    setMap,
    confirm,
    back,
    reset,
  };
}

export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
