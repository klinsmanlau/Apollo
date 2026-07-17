import { prisma } from "@/lib/prisma";
import { parseZephyrWorkbook, type ParsedCase } from "./zephyr";
import {
  initProjectKeyingFromKeys,
  nextCaseKeys,
  bumpCaseSeqToMax,
  parseKey,
} from "@/lib/keys";
import type { Prisma } from "@prisma/client";

export type ImportSummary = {
  created: number;
  updated: number;
  suitesCreated: number;
  skipped: number;
  unmappedHeaders: string[];
  total: number;
};

// How many rows per createMany / IN-list, and how many updates in flight at
// once (kept below Prisma's default connection pool so nothing queues long).
const CREATE_CHUNK = 200;
const LOOKUP_CHUNK = 2000;
const UPDATE_CONCURRENCY = 8;

function caseData(pc: ParsedCase, suiteId: string) {
  return {
    suiteId,
    title: pc.title,
    objective: pc.objective,
    preconditions: pc.preconditions,
    scriptType: pc.scriptType,
    steps: pc.steps as unknown as Prisma.InputJsonValue,
    scriptBody: pc.scriptBody,
    priority: pc.priority,
    status: pc.status,
    component: pc.component,
    ownerName: pc.ownerName,
    estimatedTime: pc.estimatedTime,
    tags: pc.tags,
    coverage: pc.coverage,
    customFields: pc.customFields as Prisma.InputJsonValue,
  };
}

/**
 * Persist a batch of parsed cases: create nested suites as needed and upsert
 * cases by sourceKey (Zephyr key stays authoritative). Shared by the .xlsx
 * importer and the Zephyr API sync so both update the same rows. Reports
 * progress through the callbacks so the caller can stream it.
 *
 * Batched for the pooler: one query prefetches the suite tree, one (chunked)
 * query resolves existing cases by sourceKey, new rows go in via createMany,
 * and updates run a few at a time — instead of two round trips per case.
 */
export async function persistCases(opts: {
  projectId: string;
  userId: string;
  cases: ParsedCase[];
  onStart?: (total: number) => void;
  onProgress?: (done: number, total: number) => void;
}): Promise<Omit<ImportSummary, "skipped" | "unmappedHeaders">> {
  const total = opts.cases.length;
  opts.onStart?.(total);

  // Establish the project's key prefix/sequence from the incoming Zephyr keys
  // (only if not already set), so generated keys stay consistent.
  await initProjectKeyingFromKeys(
    opts.projectId,
    opts.cases.map((c) => c.sourceKey)
  );

  // ---- Suites: seed the path cache from the whole tree in ONE query; only
  // genuinely new folders hit the DB afterwards.
  const suiteCache = new Map<string, string>(); // "<projectId>/A/B" -> suiteId
  {
    const all = await prisma.testSuite.findMany({
      where: { projectId: opts.projectId },
      select: { id: true, name: true, parentSuiteId: true },
    });
    const byId = new Map(all.map((s) => [s.id, s]));
    for (const s of all) {
      const parts: string[] = [];
      let cur: (typeof all)[number] | undefined = s;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentSuiteId ? byId.get(cur.parentSuiteId) : undefined;
      }
      suiteCache.set(opts.projectId + "/" + parts.join("/"), s.id);
    }
  }
  let suitesCreated = 0;

  async function ensureSuitePath(path: string[]): Promise<string> {
    const segs = path.length > 0 ? path : ["Imported"];
    let parentId: string | null = null;
    let key = opts.projectId;
    for (const name of segs) {
      key += "/" + name;
      let id: string | undefined = suiteCache.get(key);
      if (!id) {
        const createdSuite: { id: string } = await prisma.testSuite.create({
          data: { projectId: opts.projectId, parentSuiteId: parentId, name },
          select: { id: true },
        });
        id = createdSuite.id;
        suitesCreated++;
        suiteCache.set(key, id);
      }
      parentId = id;
    }
    return parentId as string;
  }

  // Resolve every case's suite (cache hits are free; only new folders query).
  const suiteIds: string[] = [];
  for (const pc of opts.cases) suiteIds.push(await ensureSuitePath(pc.folderPath));

  // ---- Existing cases: one chunked lookup for every incoming sourceKey.
  // (Global by sourceKey — it is unique across projects, matching the
  // previous per-case findUnique semantics.)
  const sourceKeys = [
    ...new Set(
      opts.cases.map((c) => c.sourceKey).filter((k): k is string => !!k)
    ),
  ];
  const idBySourceKey = new Map<string, string>();
  for (let i = 0; i < sourceKeys.length; i += LOOKUP_CHUNK) {
    const rows = await prisma.testCase.findMany({
      where: { sourceKey: { in: sourceKeys.slice(i, i + LOOKUP_CHUNK) } },
      select: { id: true, sourceKey: true },
    });
    for (const r of rows) idBySourceKey.set(r.sourceKey!, r.id);
  }

  // ---- Partition into creates and updates, preserving the sequential
  // semantics: within one batch, a repeated sourceKey behaves as
  // create-then-update (last occurrence's data wins; counted as updates).
  const creates: { pc: ParsedCase; suiteId: string }[] = [];
  const createIdxBySourceKey = new Map<string, number>();
  const updateById = new Map<string, { pc: ParsedCase; suiteId: string }>();
  let created = 0;
  let updated = 0;

  opts.cases.forEach((pc, i) => {
    const suiteId = suiteIds[i];
    if (pc.sourceKey) {
      const existingId = idBySourceKey.get(pc.sourceKey);
      if (existingId) {
        updateById.set(existingId, { pc, suiteId }); // last data wins
        updated++;
        return;
      }
      const pending = createIdxBySourceKey.get(pc.sourceKey);
      if (pending != null) {
        creates[pending] = { pc, suiteId }; // duplicate in batch: last wins
        updated++;
        return;
      }
      createIdxBySourceKey.set(pc.sourceKey, creates.length);
    }
    creates.push({ pc, suiteId });
    created++;
  });

  let done = 0;
  const progress = (n: number) => {
    done = Math.min(total, done + n);
    opts.onProgress?.(done, total);
  };

  // ---- Creates: allocate the whole key block for keyless rows in one
  // round trip (file order, matching the previous one-at-a-time numbering),
  // then insert in chunks.
  const keylessCount = creates.filter((c) => !c.pc.sourceKey).length;
  const generatedKeys = await nextCaseKeys(opts.projectId, keylessCount);
  let nextGenerated = 0;

  const createRows = creates.map(({ pc, suiteId }) => {
    const key = pc.sourceKey ?? generatedKeys[nextGenerated++];
    return {
      ...caseData(pc, suiteId),
      key,
      keyNum: parseKey(key)?.num ?? null,
      sourceKey: pc.sourceKey,
      createdById: opts.userId,
    };
  });
  for (let i = 0; i < createRows.length; i += CREATE_CHUNK) {
    const chunk = createRows.slice(i, i + CREATE_CHUNK);
    await prisma.testCase.createMany({ data: chunk });
    progress(chunk.length);
  }

  // ---- Updates: each row's data differs, so they stay individual UPDATEs,
  // but run a handful in parallel instead of strictly one after another.
  const updateEntries = [...updateById.entries()];
  for (let i = 0; i < updateEntries.length; i += UPDATE_CONCURRENCY) {
    const chunk = updateEntries.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(
      chunk.map(([id, { pc, suiteId }]) =>
        prisma.testCase.update({ where: { id }, data: caseData(pc, suiteId) })
      )
    );
    progress(chunk.length);
  }

  // Duplicate sourceKeys fold into one write; make sure the bar still ends full.
  if (done < total) opts.onProgress?.(total, total);

  // Keep the counter past the highest imported number.
  await bumpCaseSeqToMax(opts.projectId);

  return { created, updated, suitesCreated, total };
}

/**
 * Parse a Zephyr workbook and import its cases (via persistCases). Reports
 * progress through the callbacks so the caller can stream it to the client.
 */
export async function importCases(opts: {
  projectId: string;
  userId: string;
  buffer: ArrayBuffer | Buffer;
  onStart?: (total: number) => void;
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportSummary> {
  const parsed = await parseZephyrWorkbook(opts.buffer);
  const summary = await persistCases({
    projectId: opts.projectId,
    userId: opts.userId,
    cases: parsed.cases,
    onStart: opts.onStart,
    onProgress: opts.onProgress,
  });
  return {
    ...summary,
    skipped: parsed.skipped,
    unmappedHeaders: parsed.unmappedHeaders,
  };
}
