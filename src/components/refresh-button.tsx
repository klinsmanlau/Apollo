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
      className="btn btn-sm btn-secondary h-8"
    >
      <span className={`text-sm leading-none ${spinning ? "animate-spin" : ""}`} aria-hidden>
        ↻
      </span>
      Refresh
    </button>
  );
}
