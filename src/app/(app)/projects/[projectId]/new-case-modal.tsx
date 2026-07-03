"use client";

import { useState } from "react";
import { createCase } from "@/lib/actions/cases";
import { CaseForm } from "./cases/case-form";
import { Modal } from "@/components/modal";

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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98]"
      >
        + New test case
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create test case"
        maxWidth="max-w-3xl"
      >
        <CaseForm
          action={createCase}
          projectId={projectId}
          suiteOptions={suiteOptions}
          initial={{ suiteId: defaultSuiteId ?? "" }}
          submitLabel="Create test case"
        />
      </Modal>
    </>
  );
}
