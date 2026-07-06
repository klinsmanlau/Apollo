"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const path = usePathname();
  const onCycles = path.includes("/cycles");
  const tabs = [
    { href: `/projects/${projectId}`, label: "Test Cases", active: !onCycles },
    { href: `/projects/${projectId}/cycles`, label: "Test Cycles", active: onCycles },
  ];
  return (
    <div className="flex shrink-0 gap-4 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
            t.active
              ? "border-ring text-fg"
              : "border-transparent text-muted hover:text-fg"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
