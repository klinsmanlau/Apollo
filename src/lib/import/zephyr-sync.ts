import { persistCases } from "./run";
import { fetchZephyrCases } from "./zephyr-api";

export type ZephyrSyncSummary = {
  created: number;
  updated: number;
  suitesCreated: number;
  total: number;
};

/**
 * On-demand sync: pull all test cases for a Jira project from Zephyr Scale Cloud
 * and upsert them into an Apollo project (by sourceKey / Zephyr key). Zephyr is
 * the source of truth — existing cases are updated. A temporary migration tool.
 */
export async function syncFromZephyr(opts: {
  projectId: string;
  userId: string;
  token: string;
  projectKey: string;
  onProgress?: (phase: "fetch" | "persist", done: number, total: number) => void;
}): Promise<ZephyrSyncSummary> {
  const cases = await fetchZephyrCases({
    token: opts.token,
    projectKey: opts.projectKey,
    onProgress: (d, t) => opts.onProgress?.("fetch", d, t),
  });

  const summary = await persistCases({
    projectId: opts.projectId,
    userId: opts.userId,
    cases,
    onProgress: (d, t) => opts.onProgress?.("persist", d, t),
  });

  return summary;
}
