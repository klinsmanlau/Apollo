"use client";

import Link from "next/link";
import { formatEta, type UseImport } from "../use-import";

export function ImportForm({
  projectId,
  imp,
  onViewResults,
}: {
  projectId: string;
  imp: UseImport;
  onViewResults?: () => void;
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) imp.start(file);
  }

  const showForm = imp.status === "idle" || imp.status === "error";

  return (
    <div className="space-y-5">
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">
              Zephyr Scale export (.xlsx)
            </label>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-fg hover:file:opacity-90"
            />
            <p className="mt-2 text-xs text-muted">
              Folders become nested suites; priority, labels, steps, and custom
              fields are mapped automatically. Re-importing updates cases matched
              by their Zephyr <span className="font-mono">Key</span>.
            </p>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
          >
            Import
          </button>
        </form>
      )}

      {imp.status === "error" && imp.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {imp.error}
        </div>
      )}

      {imp.busy && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-fg">
              {imp.status === "preparing"
                ? "Uploading & parsing…"
                : `Importing ${imp.done.toLocaleString()} / ${imp.total.toLocaleString()}`}
            </span>
            {imp.status === "importing" && (
              <span className="text-muted">
                {imp.pct}% · ETA {formatEta(imp.eta)}
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full bg-primary transition-all duration-200 ${
                imp.status === "preparing" ? "w-1/3 animate-pulse" : ""
              }`}
              style={
                imp.status === "importing" ? { width: `${imp.pct}%` } : undefined
              }
            />
          </div>
          <p className="text-xs text-subtle">
            You can close this window — the import will keep running in the
            background.
          </p>
        </div>
      )}

      {imp.status === "done" && imp.summary && (
        <div className="animate-rise space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-500/30 dark:bg-green-500/10">
          <p className="font-semibold text-green-800 dark:text-green-300">
            Import complete ✓
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-green-900 dark:text-green-200 sm:grid-cols-4">
            <li>
              <span className="text-2xl font-bold">{imp.summary.created}</span>
              <br />
              cases created
            </li>
            <li>
              <span className="text-2xl font-bold">{imp.summary.updated}</span>
              <br />
              cases updated
            </li>
            <li>
              <span className="text-2xl font-bold">
                {imp.summary.suitesCreated}
              </span>
              <br />
              suites created
            </li>
            <li>
              <span className="text-2xl font-bold">{imp.summary.skipped}</span>
              <br />
              rows skipped
            </li>
          </ul>
          {imp.summary.unmappedHeaders.length > 0 && (
            <p className="text-xs text-green-800 dark:text-green-300">
              Custom columns stored in each case&apos;s custom-fields:{" "}
              {imp.summary.unmappedHeaders.join(", ")}
            </p>
          )}
          <div className="flex items-center gap-2">
            {onViewResults ? (
              <button
                onClick={onViewResults}
                className="btn btn-primary"
              >
                View imported cases →
              </button>
            ) : (
              <Link
                href={`/projects/${projectId}`}
                className="btn btn-primary"
              >
                View imported cases →
              </Link>
            )}
            <button
              onClick={imp.reset}
              className="btn btn-secondary"
            >
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
