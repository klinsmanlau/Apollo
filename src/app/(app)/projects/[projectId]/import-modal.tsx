"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportForm } from "./import/import-form";
import { Modal } from "@/components/modal";

export function ImportModal({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

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

      <Modal
        open={open}
        onClose={close}
        title="Import from Zephyr"
        description="Upload a Zephyr Scale export to populate suites and cases."
        maxWidth="max-w-lg"
      >
        <ImportForm projectId={projectId} onDone={close} />
      </Modal>
    </>
  );
}
