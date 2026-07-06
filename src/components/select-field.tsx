"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Opt = { value: string; label: string };
export const opts = (arr: string[]): Opt[] => arr.map((v) => ({ value: v, label: v }));

/** Custom dropdown: invisible until hovered, with a hover ✕ to clear. */
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

  function toggle() {
    if (!open && btnRef.current) {
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
    setOpen((o) => !o);
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
              ✕
            </span>
          )}
          <span className="text-xl leading-none text-subtle">▾</span>
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              style={{
                position: "fixed",
                left: rect.left,
                width: rect.width,
                maxHeight: rect.maxH,
                ...(rect.top != null ? { top: rect.top } : {}),
                ...(rect.bottom != null ? { bottom: rect.bottom } : {}),
              }}
              className="z-50 min-w-[10rem] overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-xl"
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
              {filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${
                    o.value === value ? "text-fg" : "text-muted"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
