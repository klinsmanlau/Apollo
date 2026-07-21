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
        className="btn btn-primary"
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
