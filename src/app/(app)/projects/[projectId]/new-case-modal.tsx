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
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        + New test case
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Create test case"
        >
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold">Create test case</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
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
