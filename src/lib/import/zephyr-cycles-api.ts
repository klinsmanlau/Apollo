import type { ExecutionStatus } from "@prisma/client";
import { zGet, zList, stripHtml, type ZephyrPage } from "./zephyr-api";

// Raw Zephyr Cloud shapes (only the fields we use).
type ZCycle = {
  key: string;
  name: string;
  description?: string | null;
  status?: { id: number } | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  owner?: { accountId?: string } | null;
};

type ZExecution = {
  key: string;
  testCase?: { self?: string } | null;
  testExecutionStatus?: { id: number } | null;
  actualEndDate?: string | null;
  comment?: string | null;
};

// Parsed, Apollo-ready shapes.
export type ZephyrExec = {
  caseKey: string | null; // e.g. "TS-T592"
  status: ExecutionStatus;
  executedAt: string | null;
  notes: string | null;
  defectRef: string | null;
};

export type ZephyrCycle = {
  key: string; // "TS-R10"
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  executions: ZephyrExec[];
};

export type ZephyrCyclesFetchOptions = {
  token: string;
  projectKey: string;
  onProgress?: (done: number, total: number) => void;
};

// Zephyr TEST_EXECUTION status names → Apollo enum. Names are stable across
// tenants (Pass/Fail/Blocked/In Progress/Not Executed); ids are per-project so
// we resolve id→name from /statuses first.
function toExecStatus(name: string | undefined): ExecutionStatus {
  switch ((name ?? "").toLowerCase()) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "blocked":
      return "blocked";
    case "in progress":
      return "in_progress";
    default:
      return "not_executed";
  }
}

// Pull the case key out of a testCase.self URL:
// ".../testcases/TS-T592/versions/1" → "TS-T592".
function caseKeyFromSelf(self: string | undefined | null): string | null {
  if (!self) return null;
  const m = self.match(/\/testcases\/([A-Za-z][A-Za-z0-9]*-T\d+)\b/);
  return m ? m[1] : null;
}

// Zephyr sometimes embeds a DeviceCloud "Console URL: ..." in the comment;
// capture it as a defect/evidence link.
function consoleUrlFrom(comment: string | undefined | null): string | null {
  if (!comment) return null;
  const m = comment.match(/https?:\/\/console\.devicecloud\.dev\/[^\s"'<]+/);
  return m ? m[0].replace(/&amp;/g, "&") : null;
}

/**
 * Fetch all test cycles for a Jira project from Zephyr Scale Cloud, each with
 * its executions (matched to cases by key downstream). Executions are pulled
 * per cycle (the flat /testexecutions list doesn't reliably carry testCycle).
 * A small worker pool keeps a few cycles in flight; zGet retries 429s.
 */
export async function fetchZephyrCycles(
  opts: ZephyrCyclesFetchOptions
): Promise<ZephyrCycle[]> {
  const { token, projectKey } = opts;

  // 1) Execution status id → name.
  const statuses = await zList<{ id: number; name: string }>(
    `/statuses?projectKey=${encodeURIComponent(projectKey)}&statusType=TEST_EXECUTION`,
    token
  );
  const statusName = new Map(statuses.map((s) => [s.id, s.name]));

  // 2) All cycles.
  const cycles = await zList<ZCycle>(
    `/testcycles?projectKey=${encodeURIComponent(projectKey)}`,
    token
  );

  const total = cycles.length;
  let done = 0;
  const out: ZephyrCycle[] = new Array(cycles.length);

  // 3) Per-cycle executions, a few cycles concurrently.
  const CONCURRENCY = 5;
  let nextIdx = 0;
  async function worker() {
    for (;;) {
      const i = nextIdx++;
      if (i >= cycles.length) return;
      const c = cycles[i];
      let executions: ZephyrExec[] = [];
      try {
        const rows = await zList<ZExecution>(
          `/testexecutions?projectKey=${encodeURIComponent(projectKey)}&testCycle=${encodeURIComponent(c.key)}`,
          token
        );
        executions = rows.map((e) => ({
          caseKey: caseKeyFromSelf(e.testCase?.self),
          status: toExecStatus(statusName.get(e.testExecutionStatus?.id ?? -1)),
          executedAt: e.actualEndDate ?? null,
          notes: e.comment ? stripHtml(e.comment) || null : null,
          defectRef: consoleUrlFrom(e.comment),
        }));
      } catch {
        executions = []; // non-fatal per cycle
      }
      out[i] = {
        key: c.key,
        name: c.name,
        description: c.description ? stripHtml(c.description) || null : null,
        startDate: c.plannedStartDate ?? null,
        endDate: c.plannedEndDate ?? null,
        executions,
      };
      done++;
      opts.onProgress?.(done, total);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cycles.length) }, worker)
  );

  return out;
}

// Re-exported so the pager type is available to callers if needed.
export type { ZephyrPage };
