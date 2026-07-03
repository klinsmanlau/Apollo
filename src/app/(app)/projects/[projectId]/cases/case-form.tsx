"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/cases";
import type { Step } from "@/lib/validation";
import { SubmitButton } from "@/components/submit-button";

type CaseFormValues = {
  suiteId: string;
  title: string;
  preconditions: string;
  steps: Step[];
  expectedResult: string;
  priority: string;
  type: string;
  tags: string[];
  externalRef: string;
};

const PRIORITIES = ["low", "medium", "high", "critical"];
const TYPES = [
  "functional",
  "regression",
  "smoke",
  "integration",
  "performance",
  "security",
  "usability",
];

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none";

export function CaseForm({
  action,
  projectId,
  caseId,
  suiteOptions,
  initial,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  projectId: string;
  caseId?: string;
  suiteOptions: { id: string; label: string }[];
  initial?: Partial<CaseFormValues>;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  const [steps, setSteps] = useState<Step[]>(
    initial?.steps?.length ? initial.steps : [{ action: "", expected: "" }]
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    );
  }
  function addStep() {
    setSteps((prev) => [...prev, { action: "", expected: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function commitTag() {
    const t = tagDraft.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  // Only steps with a non-empty action are persisted.
  const cleanSteps = steps.filter((s) => s.action.trim().length > 0);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      {caseId && <input type="hidden" name="caseId" value={caseId} />}
      <input type="hidden" name="steps" value={JSON.stringify(cleanSteps)} />
      <input type="hidden" name="tags" value={JSON.stringify(tags)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Title *</span>
          <input
            name="title"
            required
            defaultValue={initial?.title ?? ""}
            className={inputClass}
            placeholder="e.g. User can reset password via email"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Suite *</span>
          <select
            name="suiteId"
            required
            defaultValue={initial?.suiteId ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select a suite…
            </option>
            {suiteOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">
            External ref
          </span>
          <input
            name="externalRef"
            defaultValue={initial?.externalRef ?? ""}
            className={inputClass}
            placeholder="Jira key, e.g. APP-1234"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Priority</span>
          <select
            name="priority"
            defaultValue={initial?.priority ?? "medium"}
            className={inputClass}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Type</span>
          <select
            name="type"
            defaultValue={initial?.type ?? "functional"}
            className={inputClass}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">
          Preconditions
        </span>
        <textarea
          name="preconditions"
          rows={2}
          defaultValue={initial?.preconditions ?? ""}
          className={inputClass}
          placeholder="State the app must be in before these steps run."
        />
      </label>

      {/* Steps editor */}
      <div className="text-sm">
        <span className="mb-2 block font-medium text-gray-700">Steps</span>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_1fr_auto] items-start gap-2"
            >
              <span className="mt-2 w-5 text-right text-xs text-gray-400">
                {i + 1}
              </span>
              <textarea
                rows={1}
                value={s.action}
                onChange={(e) => updateStep(i, { action: e.target.value })}
                placeholder="Action"
                className={inputClass}
              />
              <textarea
                rows={1}
                value={s.expected ?? ""}
                onChange={(e) => updateStep(i, { expected: e.target.value })}
                placeholder="Expected result"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="mt-1.5 px-2 text-gray-400 hover:text-red-600"
                title="Remove step"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          + Add step
        </button>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">
          Overall expected result
        </span>
        <textarea
          name="expectedResult"
          rows={2}
          defaultValue={initial?.expectedResult ?? ""}
          className={inputClass}
          placeholder="Final expected outcome of the whole case."
        />
      </label>

      {/* Tags editor */}
      <div className="text-sm">
        <span className="mb-1 block font-medium text-gray-700">Tags</span>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
            >
              {t}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                className="text-indigo-400 hover:text-indigo-700"
              >
                ✕
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitTag();
              }
            }}
            onBlur={commitTag}
            placeholder="Add tag + Enter"
            className="w-40 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
