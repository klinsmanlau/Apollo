import { prisma } from "@/lib/prisma";
import { nextCycleKey, parseKey } from "@/lib/keys";
import { fetchZephyrCycles } from "./zephyr-cycles-api";
import type { ExecutionStatus, Prisma } from "@prisma/client";

const IMPORT_FOLDER = "Zephyr (imported)";

export type ZephyrCycleSyncSummary = {
  cyclesCreated: number;
  cyclesUpdated: number;
  executionsWritten: number;
  executionsSkipped: number; // executions whose case isn't in Apollo
  cyclesTotal: number;
};

// 100% executed → done; some executed → in_progress; none → not_executed.
function deriveCycleStatus(execs: { status: ExecutionStatus }[]): "not_executed" | "in_progress" | "done" {
  if (execs.length === 0) return "not_executed";
  const executed = execs.filter((e) => e.status !== "not_executed").length;
  if (executed === 0) return "not_executed";
  return executed >= execs.length ? "done" : "in_progress";
}

/**
 * Sync Zephyr Scale Cloud test cycles + their executions into Apollo.
 * - Cycles land under a "Zephyr (imported)" folder, idempotent on
 *   externalRunId = "zephyr:<cycleKey>" (isolated from DeviceCloud's upload_id).
 * - Executions match cases by Zephyr key (sourceKey); unmatched are skipped.
 * - Assignee/executor are left blank (Zephyr sends Jira account IDs).
 * Requires the case sync to have run first so executions have cases to attach to.
 */
export async function syncCyclesFromZephyr(opts: {
  projectId: string;
  token: string;
  projectKey: string;
  onProgress?: (phase: "fetch" | "persist", done: number, total: number) => void;
}): Promise<ZephyrCycleSyncSummary> {
  const cycles = await fetchZephyrCycles({
    token: opts.token,
    projectKey: opts.projectKey,
    onProgress: (d, t) => opts.onProgress?.("fetch", d, t),
  });

  // Rebuild the Zephyr cycle-folder hierarchy in Apollo (same approach as the
  // case import's suites). Seed the path cache from the existing tree in ONE
  // query; only genuinely new folders hit the DB afterwards.
  const folderCache = new Map<string, string>(); // "<projectId>/A/B" -> folderId
  {
    const all = await prisma.cycleFolder.findMany({
      where: { projectId: opts.projectId },
      select: { id: true, name: true, parentFolderId: true },
    });
    const byId = new Map(all.map((f) => [f.id, f]));
    for (const f of all) {
      const parts: string[] = [];
      let cur: (typeof all)[number] | undefined = f;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined;
      }
      folderCache.set(opts.projectId + "/" + parts.join("/"), f.id);
    }
  }

  // Cycles with no Zephyr folder fall back to a top-level "Zephyr (imported)"
  // folder (mirrors the case import's "Imported" fallback).
  async function ensureCycleFolderPath(path: string[]): Promise<string> {
    const segs = path.length > 0 ? path : [IMPORT_FOLDER];
    let parentId: string | null = null;
    let key = opts.projectId;
    for (const name of segs) {
      key += "/" + name;
      let id: string | undefined = folderCache.get(key);
      if (!id) {
        const created: { id: string } = await prisma.cycleFolder.create({
          data: { projectId: opts.projectId, parentFolderId: parentId, name },
          select: { id: true },
        });
        id = created.id;
        folderCache.set(key, id);
      }
      parentId = id;
    }
    return parentId as string;
  }

  // Preload case sourceKey → id for the whole project (one pass, chunked).
  const idByKey = new Map<string, string>();
  {
    const all = await prisma.testCase.findMany({
      where: { suite: { projectId: opts.projectId } },
      select: { id: true, key: true, sourceKey: true },
    });
    for (const c of all) {
      if (c.sourceKey) idByKey.set(c.sourceKey, c.id);
      if (c.key) idByKey.set(c.key, c.id);
    }
  }

  const summary: ZephyrCycleSyncSummary = {
    cyclesCreated: 0,
    cyclesUpdated: 0,
    executionsWritten: 0,
    executionsSkipped: 0,
    cyclesTotal: cycles.length,
  };

  let done = 0;
  for (const zc of cycles) {
    const externalRunId = `zephyr:${zc.key}`;

    // Resolve executions to Apollo cases; dedup by case (last wins), skip misses.
    const execByCase = new Map<string, {
      caseId: string;
      status: ExecutionStatus;
      notes: string | null;
      defectRef: string | null;
      executedAt: Date | null;
    }>();
    for (const e of zc.executions) {
      const caseId = e.caseKey ? idByKey.get(e.caseKey) : undefined;
      if (!caseId) {
        summary.executionsSkipped++;
        continue;
      }
      execByCase.set(caseId, {
        caseId,
        status: e.status,
        notes: e.notes,
        defectRef: e.defectRef,
        executedAt: e.executedAt ? new Date(e.executedAt) : null,
      });
    }
    const execs = [...execByCase.values()];
    const cycleStatus = deriveCycleStatus(execs);
    const folderId = await ensureCycleFolderPath(zc.folderPath);

    // Upsert the cycle (TestRun) by externalRunId.
    const existing = await prisma.testRun.findUnique({
      where: { externalRunId },
      select: { id: true },
    });

    let runId: string;
    if (existing) {
      await prisma.testRun.update({
        where: { id: existing.id },
        data: {
          name: zc.name,
          description: zc.description,
          status: cycleStatus,
          startDate: zc.startDate ? new Date(zc.startDate) : null,
          endDate: zc.endDate ? new Date(zc.endDate) : null,
          folderId,
        },
      });
      runId = existing.id;
      // Replace this cycle's executions so a re-sync reflects Zephyr exactly.
      await prisma.testExecution.deleteMany({ where: { runId } });
      summary.cyclesUpdated++;
    } else {
      const key = await nextCycleKey(opts.projectId);
      const created = await prisma.testRun.create({
        data: {
          projectId: opts.projectId,
          key,
          keyNum: parseKey(key)?.num ?? null,
          name: zc.name,
          description: zc.description,
          status: cycleStatus,
          ownerName: "Zephyr",
          folderId,
          startDate: zc.startDate ? new Date(zc.startDate) : null,
          endDate: zc.endDate ? new Date(zc.endDate) : null,
          externalRunId,
        },
        select: { id: true },
      });
      runId = created.id;
      summary.cyclesCreated++;
    }

    if (execs.length) {
      await prisma.testExecution.createMany({
        data: execs.map((e) => ({
          runId,
          caseId: e.caseId,
          status: e.status,
          notes: e.notes,
          defectRef: e.defectRef,
          executedAt: e.executedAt,
        })) as Prisma.TestExecutionCreateManyInput[],
        skipDuplicates: true,
      });
      summary.executionsWritten += execs.length;
    }

    done++;
    opts.onProgress?.("persist", done, cycles.length);
  }

  return summary;
}
