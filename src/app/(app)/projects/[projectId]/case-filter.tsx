"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FILTER_FIELDS,
  filterFieldByKey,
  type CaseFilter,
  type FilterFieldDef,
} from "@/lib/case-filters";

// Human labels for enum option values (e.g. "high" → "High").
function optLabel(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Zephyr-style filter builder. A "Filters" button opens a panel where the user
 * adds criteria (any detail or custom field) and picks values. Enum fields are
 * multi-select (OR within the field); text fields are contains. Criteria are
 * AND-ed. State is controlled by the parent (in-memory).
 */
export function CaseFilterButton({
  filters,
  onChange,
}: {
  filters: CaseFilter[];
  onChange: (next: CaseFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const activeCount = filters.length;
  const usedKeys = useMemo(() => new Set(filters.map((f) => f.field)), [filters]);

  // Close panel on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const availableFields = FILTER_FIELDS.filter(
    (f) => !usedKeys.has(f.key) && f.label.toLowerCase().includes(pickerQuery.toLowerCase())
  );

  function addField(field: FilterFieldDef) {
    onChange([...filters, { field: field.key, values: [] }]);
    setAdding(false);
    setPickerQuery("");
  }
  function updateCriterion(field: string, values: string[]) {
    onChange(filters.map((f) => (f.field === field ? { ...f, values } : f)));
  }
  function removeCriterion(field: string) {
    onChange(filters.filter((f) => f.field !== field));
  }

  const byGroup = (group: FilterFieldDef["group"]) =>
    availableFields.filter((f) => f.group === group);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
          activeCount > 0
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-line bg-surface text-fg hover:bg-surface-muted"
        }`}
      >
        <span aria-hidden>⛃</span>
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-ring">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 w-80 rounded-lg border border-line bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-fg">Filters</span>
            {activeCount > 0 && (
              <button
                onClick={() => onChange([])}
                className="text-xs text-subtle hover:text-fg"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Active criteria */}
          <div className="space-y-3">
            {filters.map((f) => {
              const def = filterFieldByKey(f.field);
              if (!def) return null;
              return (
                <Criterion
                  key={f.field}
                  def={def}
                  values={f.values}
                  onChange={(v) => updateCriterion(f.field, v)}
                  onRemove={() => removeCriterion(f.field)}
                />
              );
            })}
            {filters.length === 0 && (
              <p className="text-xs text-subtle">No criteria yet. Add one below.</p>
            )}
          </div>

          {/* Add-criteria picker */}
          <div className="mt-3 border-t border-line pt-2">
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                disabled={availableFields.length === 0 && pickerQuery === ""}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                + Add criteria
              </button>
            ) : (
              <div>
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search fields…"
                  className="field mb-2 h-7 w-full px-2 text-xs"
                />
                <div className="max-h-56 overflow-y-auto">
                  {(["Details", "Custom fields"] as const).map((group) =>
                    byGroup(group).length > 0 ? (
                      <div key={group} className="mb-1">
                        <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                          {group}
                        </div>
                        {byGroup(group).map((f) => (
                          <button
                            key={f.key}
                            onClick={() => addField(f)}
                            className="block w-full rounded px-2 py-1 text-left text-xs text-fg hover:bg-surface-muted"
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    ) : null
                  )}
                  {availableFields.length === 0 && (
                    <p className="px-2 py-1 text-xs text-subtle">No fields.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Criterion({
  def,
  values,
  onChange,
  onRemove,
}: {
  def: FilterFieldDef;
  values: string[];
  onChange: (v: string[]) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg">{def.label}</span>
        <button
          onClick={onRemove}
          className="text-xs text-subtle hover:text-fg"
          aria-label={`Remove ${def.label} filter`}
        >
          ✕
        </button>
      </div>

      {def.kind === "enum" && def.options ? (
        <div className="flex flex-wrap gap-1">
          {def.options.map((opt) => {
            const on = values.includes(opt);
            return (
              <button
                key={opt}
                onClick={() =>
                  onChange(on ? values.filter((v) => v !== opt) : [...values, opt])
                }
                className={`rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
                  on
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-line bg-surface text-muted hover:text-fg"
                }`}
              >
                {optLabel(opt)}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={values[0] ?? ""}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          placeholder={`${def.label} contains…`}
          className="field h-7 w-full px-2 text-xs"
        />
      )}
    </div>
  );
}
