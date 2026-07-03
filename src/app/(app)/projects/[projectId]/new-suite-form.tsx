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
    <form action={formAction} className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold text-muted">New suite</h2>
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="name"
        placeholder="Suite name"
        required
        className="field"
      />
      <select name="parentSuiteId" defaultValue="" className="field">
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
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
