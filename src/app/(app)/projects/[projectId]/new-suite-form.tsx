"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSuite, type FormState } from "@/lib/actions/suites";
import { SubmitButton } from "@/components/submit-button";

export function NewSuiteForm({
  projectId,
  suiteOptions,
  defaultParentId,
  onCreated,
}: {
  projectId: string;
  suiteOptions: { id: string; label: string }[];
  defaultParentId?: string;
  onCreated?: () => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createSuite,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // On success: reset the form, refresh the tree, notify parent (close modal).
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
      onCreated?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">
          Folder name
        </label>
        <input name="name" placeholder="e.g. Rewards" required className="field" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">
          Parent folder
        </label>
        <select
          name="parentSuiteId"
          defaultValue={defaultParentId ?? ""}
          className="field"
        >
          <option value="">— Top level —</option>
          {suiteOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className="w-full" pendingText="Adding…">
        Add folder
      </SubmitButton>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
