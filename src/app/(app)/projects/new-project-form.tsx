"use client";

import { useActionState } from "react";
import { createProject, type FormState } from "@/lib/actions/projects";
import { SubmitButton } from "@/components/submit-button";

export function NewProjectForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    createProject,
    undefined
  );

  return (
    <form action={formAction} className="card animate-rise p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">New project</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="name"
          placeholder="Project name"
          required
          className="field flex-1"
        />
        <input
          name="description"
          placeholder="Description (optional)"
          className="field flex-[2]"
        />
        <SubmitButton pendingText="Creating…">Create</SubmitButton>
      </div>
      {state?.error && (
        <p className="mt-2 text-sm text-red-500">{state.error}</p>
      )}
    </form>
  );
}
