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
    <form
      action={formAction}
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-gray-700">New project</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="name"
          placeholder="Project name"
          required
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <input
          name="description"
          placeholder="Description (optional)"
          className="flex-[2] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <SubmitButton pendingText="Creating…">Create</SubmitButton>
      </div>
      {state?.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
