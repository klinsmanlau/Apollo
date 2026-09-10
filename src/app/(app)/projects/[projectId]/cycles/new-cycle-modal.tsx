"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { SelectField, opts, type Opt } from "@/components/select-field";
import { CUSTOM_FIELDS } from "@/lib/custom-fields";
import { createCycle } from "@/lib/actions/cycles";
import type { CycleStatus } from "@prisma/client";

export type CycleUser = { id: string; name: string | null; email: string };

const STATUS_OPTS: Opt[] = [
  { value: "not_executed", label: "Not Executed" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];
const POD_OPTIONS = CUSTOM_FIELDS.find((f) => f.key === "POD")?.options ?? [];
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export function NewCycleModal({
  projectId,
  folderOptions,
  defaultFolderId,
  users,
}: {
  projectId: string;
  folderOptions: { id: string; label: string }[];
  defaultFolderId?: string;
  users: CycleUser[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CycleStatus>("not_executed");
  const [version, setVersion] = useState("");
  const [iteration, setIteration] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [custom, setCustom] = useState<Record<string, string>>({});

  const userOpts: Opt[] = users.map((u) => ({
    value: u.name ?? u.email,
    label: u.name ?? u.email,
  }));
  const folderOpts: Opt[] = [
    { value: "", label: "— Top level —" },
    ...folderOptions.map((f) => ({ value: f.id, label: f.label })),
  ];

  function reset() {
    setName("");
    setDescription("");
    setStatus("not_executed");
    setVersion("");
    setIteration("");
    setOwnerName("");
    setStartDate(today);
    setEndDate(today);
    setFolderId(defaultFolderId ?? "");
    setCustom({});
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createCycle(projectId, {
        name,
        description,
        status,
        version,
        iteration,
        ownerName,
        startDate,
        endDate,
        folderId: folderId || null,
        customFields: custom,
      });
      router.push(`/projects/${projectId}/cycles/${res.key ?? res.id}`);
    } catch {
      setBusy(false);
      setError("Something wrong, please try again later.");
    }
  }

  return (
    <>
      <button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="btn btn-primary"
      >
        + New Test Cycle
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create test cycle"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className={label}>Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Sprint 24 Regression"
              className="field"
            />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="field"
            />
          </div>

          <div>
            <h3 className="mb-3 border-b border-line pb-1 text-sm font-semibold text-fg">
              Details
            </h3>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <label className={label}>Status</label>
                <SelectField
                  value={status}
                  options={STATUS_OPTS}
                  onChange={(v) => setStatus((v || "not_executed") as CycleStatus)}
                  allowClear={false}
                  bordered
                />
              </div>
              <div>
                <label className={label}>Release version</label>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="None"
                  className="field"
                />
              </div>
              <div>
                <label className={label}>Iteration</label>
                <input
                  value={iteration}
                  onChange={(e) => setIteration(e.target.value)}
                  placeholder="None"
                  className="field"
                />
              </div>
              <div>
                <label className={label}>Owner</label>
                <SelectField
                  value={ownerName}
                  options={userOpts}
                  onChange={setOwnerName}
                  placeholder="Unassigned"
                  searchable
                  bordered
                />
              </div>
              <div>
                <label className={label}>Planned start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className={label}>Planned end date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Folder</label>
                <SelectField
                  value={folderId}
                  options={folderOpts}
                  onChange={setFolderId}
                  allowClear={false}
                  searchable
                  bordered
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 border-b border-line pb-1 text-sm font-semibold text-fg">
              Custom Fields
            </h3>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={label}>POD</label>
                <SelectField
                  value={custom["POD"] ?? ""}
                  options={opts(POD_OPTIONS)}
                  onChange={(v) => setCustom((c) => ({ ...c, POD: v }))}
                  bordered
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary"
            >
              {busy ? "Creating…" : "Create cycle"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
