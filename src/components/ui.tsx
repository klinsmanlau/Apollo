import type {
  Priority,
  CaseType,
  CaseStatus,
  ExecutionStatus,
} from "@prisma/client";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {cap(priority)}
    </span>
  );
}

const CASE_STATUS_STYLES: Record<CaseStatus, string> = {
  draft:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  approved:
    "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  deprecated:
    "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${CASE_STATUS_STYLES[status]}`}
    >
      {cap(status)}
    </span>
  );
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
  fail: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  blocked: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  not_executed: "Not executed",
  in_progress: "In progress",
  pass: "Pass",
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
