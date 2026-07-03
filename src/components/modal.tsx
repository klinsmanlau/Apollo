"use client";

import { useEffect, useState } from "react";

/**
 * Shared pop-up window. Every modal in the app should render through this so
 * they share the same enter/exit animation, backdrop, Escape-to-close, scroll
 * lock, and header. On close it plays the exit animation, then unmounts.
 *
 * Controlled via `open` — flip it to false and the exit animation runs itself.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // Mount on open; when open flips to false, start the exit animation.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
    }
  }, [open, mounted]);

  // Escape to close + background scroll lock while mounted.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-6 ${
        closing ? "animate-overlay-out" : "animate-overlay"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Unmount only after the overlay's own exit animation finishes.
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) setMounted(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${maxWidth} rounded-xl border border-line bg-surface shadow-2xl shadow-black/20 ${
          closing ? "animate-modal-out" : "animate-modal"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">{title}</h2>
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-fg"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
