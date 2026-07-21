"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Upload } from "@/components/icons";
import { ImportForm } from "./import/import-form";
import { useImport, formatEta } from "./use-import";

export function ImportModal({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // State lives here (not in the modal body) so the import survives closing.
  const imp = useImport(projectId, () => router.refresh());

  function doClose() {
    setOpen(false);
    // If the import already finished, onComplete refreshed the page; only
    // refresh here for a clean (idle/done) close where nothing is in flight.
    if (!imp.busy && imp.status !== "done") router.refresh();
  }

  function requestClose() {
    // An in-flight import keeps running in the background; make sure that's a
    // deliberate choice rather than a stray backdrop click.
    if (imp.busy) {
      setConfirmClose(true);
      return;
    }
    doClose();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-secondary">
        <Upload size={15} />
        Import from Excel
      </button>

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={doClose}
        title="Import still running"
        body="Closing this window won't cancel the import — it will keep running in the background and the list will refresh when it finishes."
        confirmLabel="Close anyway"
        cancelLabel="Keep watching"
      />

      <Modal
        open={open}
        onClose={requestClose}
        title="Import from Zephyr"
        description="Upload a Zephyr Scale export to populate suites and cases."
      >
        <ImportForm
          projectId={projectId}
          imp={imp}
          onViewResults={() => setOpen(false)}
        />
      </Modal>

      {/* Background progress — shown when importing with the window closed. */}
      {!open && imp.busy && (
        <button
          onClick={() => setOpen(true)}
          className="animate-rise fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-line bg-surface p-3 text-left shadow-xl transition-colors hover:bg-surface-muted"
        >
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-fg">
              {imp.status === "preparing"
                ? "Uploading & parsing…"
                : "Importing test cases"}
            </span>
            {imp.status === "importing" && (
              <span className="text-muted">
                {imp.pct}% · ETA {formatEta(imp.eta)}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full bg-primary transition-all duration-200 ${
                imp.status === "preparing" ? "w-1/3 animate-pulse" : ""
              }`}
              style={
                imp.status === "importing" ? { width: `${imp.pct}%` } : undefined
              }
            />
          </div>
          <p className="mt-1 text-[11px] text-subtle">
            {imp.status === "importing"
              ? `${imp.done.toLocaleString()} / ${imp.total.toLocaleString()} · click to open`
              : "click to open"}
          </p>
        </button>
      )}

      {/* Completion toast — when it finishes while the window is closed. */}
      {!open && imp.status === "done" && imp.summary && (
        <div className="animate-rise fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-green-200 bg-green-50 p-3 shadow-xl dark:border-green-500/30 dark:bg-green-500/10">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Import complete ✓
          </p>
          <p className="mt-0.5 text-xs text-green-900 dark:text-green-200">
            {imp.summary.created} created · {imp.summary.updated} updated ·{" "}
            {imp.summary.suitesCreated} suites
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setOpen(true)}
              className="btn btn-sm btn-primary"
            >
              Details
            </button>
            <button
              onClick={imp.reset}
              className="rounded-md border border-green-300 bg-transparent px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-500/40 dark:text-green-300 dark:hover:bg-green-500/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
