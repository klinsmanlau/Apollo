"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

/**
 * Reports its parent <Link>'s navigation state upward. useLinkStatus only works
 * inside a Link, so each tab renders one of these and the tab bar aggregates
 * them into a single "is any tab loading" flag.
 */
function PendingReporter({
  href,
  onChange,
}: {
  href: string;
  onChange: (href: string, pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    onChange(href, pending);
    // On unmount, make sure this tab stops being counted as pending.
    return () => onChange(href, false);
  }, [href, pending, onChange]);
  return null;
}

/**
 * Dims everything below the tab bar and centres a spinner — the same treatment
 * the case/cycle tables use while a folder loads. Rendered in a portal and
 * anchored to the bar's own bottom edge, so the header and tabs stay crisp and
 * the tabs remain clickable.
 */
function TabLoadingOverlay({ top }: { top: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      style={{ top }}
      className="animate-fade fixed inset-x-0 bottom-0 z-30 flex items-start justify-center bg-app-bg/50 backdrop-blur-[1px]"
      role="status"
      aria-label="Loading"
    >
      <div className="mt-24 h-7 w-7 animate-spin rounded-full border-2 border-line border-t-ring" />
    </div>,
    document.body
  );
}

export function ProjectTabs({ projectId }: { projectId: string }) {
  const path = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const [pendingHrefs, setPendingHrefs] = useState<string[]>([]);
  const [overlayTop, setOverlayTop] = useState(0);

  const handlePending = useCallback((href: string, pending: boolean) => {
    setPendingHrefs((prev) => {
      const has = prev.includes(href);
      if (pending === has) return prev;
      return pending ? [...prev, href] : prev.filter((h) => h !== href);
    });
  }, []);

  // Measure once a navigation starts, so the overlay begins just under the bar.
  const isPending = pendingHrefs.length > 0;
  useEffect(() => {
    if (isPending && barRef.current) {
      setOverlayTop(barRef.current.getBoundingClientRect().bottom);
    }
  }, [isPending]);

  const onCycles = path.includes("/cycles");
  const onMembers = path.includes("/members");
  const onMyWork = path.includes("/my-work");
  const tabs = [
    {
      href: `/projects/${projectId}`,
      label: "Test Cases",
      active: !onCycles && !onMembers && !onMyWork,
    },
    { href: `/projects/${projectId}/cycles`, label: "Test Cycles", active: onCycles },
    { href: `/projects/${projectId}/my-work`, label: "My Work", active: onMyWork },
    { href: `/projects/${projectId}/members`, label: "Members", active: onMembers },
  ];

  return (
    <>
      <div ref={barRef} className="flex shrink-0 gap-4 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              t.active
                ? "border-ring text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
            <PendingReporter href={t.href} onChange={handlePending} />
          </Link>
        ))}
      </div>
      {isPending && <TabLoadingOverlay top={overlayTop} />}
    </>
  );
}
