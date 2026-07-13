"use client";

import { useState } from "react";

export function RefreshButton({
  onRefresh,
  title = "Refresh",
}: {
  onRefresh: () => Promise<unknown> | unknown;
  title?: string;
}) {
  const [spinning, setSpinning] = useState(false);
  async function handle() {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      setSpinning(false);
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={spinning}
      title={title}
      aria-label={title}
      className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-fg hover:bg-surface-muted disabled:opacity-60"
    >
      <span className={`text-sm leading-none ${spinning ? "animate-spin" : ""}`} aria-hidden>
        ↻
      </span>
      Refresh
    </button>
  );
}
