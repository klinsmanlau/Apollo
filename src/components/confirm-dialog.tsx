"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

/**
 * Replacement for native `confirm()`, which renders as an OS chrome dialog and
 * breaks the app's visual language completely.
 *
 * Usage — declarative:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={run} … />
 *
 * Or imperative, as a near drop-in for `if (confirm(...)) run()`:
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   confirm({ title: "Delete folder", body: "…" , onConfirm: run });
 *   return <>{dialog}…</>;
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-5">
        {body && <div className="text-sm leading-relaxed text-muted">{body}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            {cancelLabel}
          </button>
          <button
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`btn ${destructive ? "btn-danger-solid" : "btn-primary"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type ConfirmRequest = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/** Imperative helper so call sites read almost like the old `confirm()`. */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  const dialog = (
    <ConfirmDialog
      open={req !== null}
      onClose={() => setReq(null)}
      onConfirm={() => req?.onConfirm()}
      title={req?.title ?? ""}
      body={req?.body}
      confirmLabel={req?.confirmLabel}
      destructive={req?.destructive}
    />
  );

  return { confirm: (r: ConfirmRequest) => setReq(r), dialog };
}
