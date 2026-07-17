import type {
  Priority,
  CaseType,
  CaseStatus,
  ExecutionStatus,
} from "@prisma/client";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// White text on solid fills. Low=green, Medium=dim (muted) yellow, High=red.
const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-green-600",
  medium: "bg-yellow-600",
  high: "bg-red-600",
};

// Shared sizing for all solid tag badges (priority + status).
const BADGE_BASE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold uppercase leading-tight text-white";

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${BADGE_BASE} ${PRIORITY_STYLES[priority]}`}>{priority}</span>;
}

// Zephyr-style colored flag for priority: High=red, Medium=yellow, Low=green.
const PRIORITY_FLAG_COLOR: Record<Priority, string> = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-green-500",
};

export function PriorityFlag({ priority }: { priority: Priority }) {
  return (
    <span
      className={`text-base leading-none ${PRIORITY_FLAG_COLOR[priority]}`}
      title={cap(priority)}
      aria-label={`${cap(priority)} priority`}
    >
      ⚑
    </span>
  );
}

// Solid fills with white uppercase text, matching the priority badges.
// Approved = bright green.
const CASE_STATUS_STYLES: Record<CaseStatus, string> = {
  draft: "bg-yellow-500",
  approved: "bg-green-500",
  deprecated: "bg-gray-400",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`${BADGE_BASE} ${CASE_STATUS_STYLES[status]}`}>{status}</span>;
}

export function TypeBadge({ type }: { type: CaseType }) {
  return (
    <span className="inline-flex items-center rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted">
      {type}
    </span>
  );
}

const STATUS_STYLES: Record<ExecutionStatus, string> = {
  not_executed: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  pass: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  pass_auto: "bg-green-800 text-white dark:bg-green-700 dark:text-white",
  fail: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  blocked: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  not_executed: "Not executed",
  in_progress: "In progress",
  pass: "Pass",
  pass_auto: "Pass [A]",
  fail: "Fail",
  blocked: "Blocked",
};

export function StatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
      {label}
    </span>
  );
}
