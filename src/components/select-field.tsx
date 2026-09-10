"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "@/components/icons";

export type Opt = {
  value: string;
  label: string;
  /** Optional section header shown above this option when it differs from
   *  the previous (filtered) option's group. Omit for a flat, ungrouped list
   *  — every existing caller is unaffected. */
  group?: string;
};
export const opts = (arr: string[]): Opt[] => arr.map((v) => ({ value: v, label: v }));

// ---- Single-open-dropdown coordination -------------------------------------
// Each SelectField (and any other custom picker that opts in, e.g. the Create
// Issue modal's Parent search) used to close only on a click hitting its own
// full-screen backdrop. Inside a Modal (which is itself a high z-index fixed
// layer), that backdrop can end up painted *below* the modal's own content, so
// clicking a different field inside the same modal never triggers the click
// -away handler — multiple dropdowns stayed open at once. This registry fixes
// it structurally: opening any dropdown proactively closes whichever other
// one is currently open, regardless of z-index/stacking-context accidents.
let activeDropdownId: symbol | null = null;
let activeDropdownClose: (() => void) | null = null;

export function claimOpenDropdown(id: symbol, close: () => void) {
  if (activeDropdownId !== null && activeDropdownId !== id) activeDropdownClose?.();
  activeDropdownId = id;
  activeDropdownClose = close;
}
export function releaseOpenDropdown(id: symbol) {
  if (activeDropdownId === id) {
    activeDropdownId = null;
    activeDropdownClose = null;
  }
}

/** Custom dropdown: invisible until hovered, with a hover clear button. */
export function SelectField({
  value,
  options,
  onChange,
  placeholder = "None",
  allowClear = true,
  searchable = false,
  bordered = false,
}: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  searchable?: boolean;
  /** Always-visible border (form style) vs invisible-until-hover (inline). */
  bordered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownId = useRef<symbol>(Symbol());
  const [rect, setRect] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxH: number;
  } | null>(null);

  const current = options.find((o) => o.value === value);
  const filtered =
    searchable && q.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
      : options;

  function close() {
    releaseOpenDropdown(dropdownId.current);
    setOpen(false);
  }

  // If this instance unmounts (e.g. its Modal closes) while its dropdown is
  // open, release the claim so the next dropdown to open isn't blocked.
  useEffect(() => () => releaseOpenDropdown(dropdownId.current), []);

  function toggle() {
    if (!open) {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        const below = window.innerHeight - r.bottom - 8;
        const above = r.top - 8;
        // Flip upward when there isn't enough room below.
        const openUp = below < 220 && above > below;
        setRect({
          left: r.left,
          width: r.width,
          top: openUp ? undefined : r.bottom + 4,
          bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
          maxH: Math.max(160, Math.min(288, openUp ? above : below)),
        });
      }
      claimOpenDropdown(dropdownId.current, () => setOpen(false));
      setOpen(true);
    } else {
      close();
    }
    setQ("");
  }

  const btnCls = bordered
    ? "flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-ring/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
    : "flex w-full items-center justify-between gap-2 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted focus:border-line focus:bg-surface focus:outline-none";

  return (
    <div className="group relative">
      <button ref={btnRef} type="button" onClick={toggle} className={btnCls}>
        <span className={current ? "truncate text-fg" : "truncate text-subtle"}>
          {current ? current.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {allowClear && value && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="hidden rounded text-subtle hover:text-fg group-hover:inline"
              title="Clear"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-subtle transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <>
            {/* click-away backdrop — z-index kept above Modal's own z-50 so a
                dropdown opened inside a modal still closes on outside click. */}
            <div className="fixed inset-0 z-[100]" onClick={close} />
            <div
              style={{
                position: "fixed",
                left: rect.left,
                width: rect.width,
                maxHeight: rect.maxH,
                ...(rect.top != null ? { top: rect.top } : {}),
                ...(rect.bottom != null ? { bottom: rect.bottom } : {}),
              }}
              className="panel z-[110] min-w-[10rem] overflow-y-auto"
            >
              {searchable && (
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="mb-1 w-full border-b border-line bg-transparent px-3 py-1.5 text-xs text-fg outline-none placeholder:text-subtle"
                />
              )}
              {filtered.length === 0 && (
                <p className="px-3 py-1.5 text-xs text-subtle">No matches</p>
              )}
              {filtered.map((o, i) => (
                <span key={o.value}>
                  {o.group && o.group !== filtered[i - 1]?.group && (
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-subtle first:pt-1.5">
                      {o.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      close();
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted ${
                      o.value === value ? "font-medium text-fg" : "text-muted"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.value === value && (
                      <Check size={13} className="shrink-0 text-ring" />
                    )}
                  </button>
                </span>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
