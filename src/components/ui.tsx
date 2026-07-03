import type { Priority, CaseType, ExecutionStatus } from "@prisma/client";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-700",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}

export function TypeBadge({ type }: { type: CaseType }) {
  return (
    <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
      {type}
    </span>
  );
}

const STATUS_STYLES: Record<ExecutionStatus, string> = {
  untested: "bg-gray-100 text-gray-600",
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  blocked: "bg-amber-100 text-amber-800",
  skipped: "bg-gray-100 text-gray-500",
};

export function StatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      {label}
    </span>
  );
}
