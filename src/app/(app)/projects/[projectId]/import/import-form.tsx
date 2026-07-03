"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importZephyr, type ImportState } from "@/lib/actions/import";
import { SubmitButton } from "@/components/submit-button";

export function ImportForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importZephyr,
    undefined
  );

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Zephyr Scale export (.xlsx)
          </label>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700"
          />
          <p className="mt-2 text-xs text-gray-500">
            Folders become nested suites; priority, labels, steps, and custom
            fields are mapped automatically. Re-importing updates cases matched
            by their Zephyr <span className="font-mono">Key</span>.
          </p>
        </div>
        <SubmitButton pendingText="Importing…">Import</SubmitButton>
      </form>

      {state?.ok === false && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state?.ok === true && (
        <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">Import complete ✓</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-green-900 sm:grid-cols-4">
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
            <p className="text-xs text-green-800">
              Custom columns stored in each case&apos;s custom-fields:{" "}
              {state.summary.unmappedHeaders.join(", ")}
            </p>
          )}
          <Link
            href={`/projects/${projectId}`}
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            View imported cases →
          </Link>
        </div>
      )}
    </div>
  );
}
