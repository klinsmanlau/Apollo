"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/cases";
import type { Step } from "@/lib/validation";
import { SubmitButton } from "@/components/submit-button";

type CaseFormValues = {
  suiteId: string;
  title: string;
  objective: string;
  preconditions: string;
  scriptType: string;
  steps: Step[];
  scriptBody: string;
  expectedResult: string;
  priority: string;
  type: string;
  status: string;
  component: string;
  ownerName: string;
  estimatedTime: string;
  tags: string[];
  coverage: string[];
  externalRef: string;
};

const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["draft", "approved", "deprecated"];
const SCRIPT_TYPES = ["steps", "plain", "bdd"];
const TYPES = [
  "functional",
  "regression",
  "smoke",
  "integration",
  "performance",
  "security",
  "usability",
];

const inputClass = "field";

/** Reusable chip-list editor for tags / coverage. */
function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== t))}
            className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="field w-40 px-2 py-1 text-xs"
      />
    </div>
  );
}

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

  const [scriptType, setScriptType] = useState(initial?.scriptType ?? "steps");
  const [steps, setSteps] = useState<Step[]>(
    initial?.steps?.length
      ? initial.steps
      : [{ action: "", testData: "", expected: "" }]
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [coverage, setCoverage] = useState<string[]>(initial?.coverage ?? []);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    );
  }
  function addStep() {
    setSteps((prev) => [...prev, { action: "", testData: "", expected: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  const cleanSteps = steps.filter((s) => s.action.trim().length > 0);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      {caseId && <input type="hidden" name="caseId" value={caseId} />}
      <input type="hidden" name="steps" value={JSON.stringify(cleanSteps)} />
      <input type="hidden" name="tags" value={JSON.stringify(tags)} />
      <input type="hidden" name="coverage" value={JSON.stringify(coverage)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1 block font-medium text-fg">Title *</span>
          <input
            name="title"
            required
            defaultValue={initial?.title ?? ""}
            className={inputClass}
            placeholder="e.g. User can reset password via email"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">Suite *</span>
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
          <span className="mb-1 block font-medium text-fg">Status</span>
          <select
            name="status"
            defaultValue={initial?.status ?? "draft"}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">Priority</span>
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
          <span className="mb-1 block font-medium text-fg">Type</span>
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

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">Component</span>
          <input
            name="component"
            defaultValue={initial?.component ?? ""}
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">Owner</span>
          <input
            name="ownerName"
            defaultValue={initial?.ownerName ?? ""}
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">
            Estimated time (seconds)
          </span>
          <input
            name="estimatedTime"
            type="number"
            min={0}
            defaultValue={initial?.estimatedTime ?? ""}
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">
            External ref
          </span>
          <input
            name="externalRef"
            defaultValue={initial?.externalRef ?? ""}
            className={inputClass}
            placeholder="Jira key, e.g. APP-1234"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg">Objective</span>
        <textarea
          name="objective"
          rows={2}
          defaultValue={initial?.objective ?? ""}
          className={inputClass}
          placeholder="What this test verifies."
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg">
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

      {/* Script type switch */}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg">Script type</span>
        <select
          name="scriptType"
          value={scriptType}
          onChange={(e) => setScriptType(e.target.value)}
          className={`${inputClass} sm:w-48`}
        >
          {SCRIPT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "steps" ? "Step-by-step" : t === "plain" ? "Plain text" : "BDD / Gherkin"}
            </option>
          ))}
        </select>
      </label>

      {scriptType === "steps" ? (
        <div className="text-sm">
          <span className="mb-2 block font-medium text-fg">Steps</span>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div
                key={i}
                className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-start gap-2"
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
                  value={s.testData ?? ""}
                  onChange={(e) => updateStep(i, { testData: e.target.value })}
                  placeholder="Test data"
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
                  className="mt-1.5 px-2 text-subtle transition-colors hover:text-red-500"
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
            className="mt-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            + Add step
          </button>
        </div>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">
            {scriptType === "bdd" ? "BDD script (Gherkin)" : "Plain-text script"}
          </span>
          <textarea
            name="scriptBody"
            rows={8}
            defaultValue={initial?.scriptBody ?? ""}
            className={`${inputClass} font-mono`}
            placeholder={
              scriptType === "bdd"
                ? "Given …\nWhen …\nThen …"
                : "Free-form test script."
            }
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-sm">
          <span className="mb-1 block font-medium text-fg">Tags</span>
          <ChipInput
            values={tags}
            onChange={setTags}
            placeholder="Add tag + Enter"
          />
        </div>
        <div className="text-sm">
          <span className="mb-1 block font-medium text-fg">
            Coverage (issue keys)
          </span>
          <ChipInput
            values={coverage}
            onChange={setCoverage}
            placeholder="e.g. TS-T6545 + Enter"
          />
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      <div className="flex gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
