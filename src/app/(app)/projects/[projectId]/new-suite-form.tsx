"use client";

import { useActionState } from "react";
import { createSuite, type FormState } from "@/lib/actions/suites";
import { SubmitButton } from "@/components/submit-button";

export function NewSuiteForm({
  projectId,
  suiteOptions,
}: {
  projectId: string;
  suiteOptions: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createSuite,
    undefined
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-gray-700">New suite</h2>
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="name"
        placeholder="Suite name"
        required
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
      <select
        name="parentSuiteId"
        defaultValue=""
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      >
        <option value="">— Top level —</option>
        {suiteOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <SubmitButton className="w-full" pendingText="Adding…">
        Add suite
      </SubmitButton>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
