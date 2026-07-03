"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importZephyr, type ImportState } from "@/lib/actions/import";
import { SubmitButton } from "@/components/submit-button";

export function ImportForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importZephyr,
    undefined
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
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
        <SubmitButton pendingText="Importing…">Import</SubmitButton>
      </form>

      {state?.ok === false && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {state.error}
        </div>
      )}

      {state?.ok === true && (
        <div className="animate-rise space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-500/30 dark:bg-green-500/10">
          <p className="font-semibold text-green-800 dark:text-green-300">
            Import complete ✓
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-green-900 dark:text-green-200 sm:grid-cols-4">
            <li>
              <span className="text-2xl font-bold">{state.summary.created}</span>
              <br />
              cases created
            </li>
            <li>
              <span className="text-2xl font-bold">{state.summary.updated}</span>
              <br />
              cases updated
            </li>
            <li>
              <span className="text-2xl font-bold">
                {state.summary.suitesCreated}
              </span>
              <br />
              suites created
            </li>
            <li>
              <span className="text-2xl font-bold">{state.summary.skipped}</span>
              <br />
              rows skipped
            </li>
          </ul>
          {state.summary.unmappedHeaders.length > 0 && (
            <p className="text-xs text-green-800 dark:text-green-300">
              Custom columns stored in each case&apos;s custom-fields:{" "}
              {state.summary.unmappedHeaders.join(", ")}
            </p>
          )}
          {onDone ? (
            <button
              onClick={onDone}
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98]"
            >
              View imported cases →
            </button>
          ) : (
            <Link
              href={`/projects/${projectId}`}
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90"
            >
              View imported cases →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
