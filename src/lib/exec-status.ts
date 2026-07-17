import type { ExecutionStatus } from "@prisma/client";

// Zephyr execution-result palette: colored square swatch per status, a solid
// pill for the trigger, and a left-border accent for lists. Blocked = blue,
// In Progress = amber.
export const EXEC_STATUS_META: {
  value: ExecutionStatus;
  label: string;
  pill: string;
  swatch: string;
  border: string;
}[] = [
  {
    value: "not_executed",
    label: "Not Executed",
    pill: "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-100",
    swatch: "bg-gray-300 dark:bg-gray-500",
    border: "border-l-gray-300 dark:border-l-gray-600",
  },
  {
    value: "in_progress",
    label: "In Progress",
    pill: "bg-amber-500 text-white",
    swatch: "bg-amber-400",
    border: "border-l-amber-400",
  },
  {
    value: "pass",
    label: "Pass",
    pill: "bg-green-600 text-white",
    swatch: "bg-green-500",
    border: "border-l-green-500",
  },
  {
    value: "pass_auto",
    label: "Pass [A]",
    pill: "bg-green-800 text-white",
    swatch: "bg-green-700",
    border: "border-l-green-700",
  },
  {
    value: "fail",
    label: "Fail",
    pill: "bg-red-600 text-white",
    swatch: "bg-red-500",
    border: "border-l-red-500",
  },
  {
    value: "blocked",
    label: "Blocked",
    pill: "bg-blue-600 text-white",
    swatch: "bg-blue-500",
    border: "border-l-blue-500",
  },
];

export const execMeta = (s: ExecutionStatus) =>
  EXEC_STATUS_META.find((m) => m.value === s)!;
