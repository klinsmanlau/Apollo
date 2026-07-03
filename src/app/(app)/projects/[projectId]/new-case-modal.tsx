"use client";

import { useEffect, useState } from "react";
import { createCase } from "@/lib/actions/cases";
import { CaseForm } from "./cases/case-form";

export function NewCaseModal({
  projectId,
  suiteOptions,
  defaultSuiteId,
}: {
  projectId: string;
  suiteOptions: { id: string; label: string }[];
  defaultSuiteId?: string;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape and lock background scroll while open.
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98]"
      >
        + New test case
      </button>

      {open && (
        <div
          className="animate-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Create test case"
        >
          <div className="animate-modal w-full max-w-3xl rounded-xl border border-line bg-surface shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold text-fg">Create test case</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-fg"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
              <CaseForm
                action={createCase}
                projectId={projectId}
                suiteOptions={suiteOptions}
                initial={{ suiteId: defaultSuiteId ?? "" }}
                submitLabel="Create test case"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
