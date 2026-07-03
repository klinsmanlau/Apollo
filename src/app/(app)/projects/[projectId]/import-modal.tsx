"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportForm } from "./import/import-form";

export function ImportModal({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Pull fresh suites/cases into the page after an import, then close.
  function close() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
      >
        Import from Excel
      </button>

      {open && (
        <div
          className="animate-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Import from Zephyr"
        >
          <div className="animate-modal w-full max-w-lg rounded-xl border border-line bg-surface shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-fg">
                  Import from Zephyr
                </h2>
                <p className="text-xs text-muted">
                  Upload a Zephyr Scale export to populate suites and cases.
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-fg"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
              <ImportForm projectId={projectId} onDone={close} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
