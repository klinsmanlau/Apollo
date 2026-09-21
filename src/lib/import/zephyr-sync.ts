import { persistCases, pruneEmptySuites } from "./run";
import { fetchZephyrCases } from "./zephyr-api";

export type ZephyrSyncSummary = {
  created: number;
  updated: number;
  suitesCreated: number;
  suitesDeleted: number;
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
  // Anything created from here on is spared by the prune below, so a folder a
  // teammate adds mid-sync (migration period) can't be mistaken for a deletion.
  const startedAt = new Date();

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

  // Zephyr is authoritative and we just fetched *every* live case, so any suite
  // now empty across its whole subtree was deleted in Zephyr — prune it, but
  // spare folders created after this sync began (see pruneEmptySuites).
  const suitesDeleted = await pruneEmptySuites(opts.projectId, startedAt);

  return { ...summary, suitesDeleted };
}
