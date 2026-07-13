import { prisma } from "@/lib/prisma";
import { parseZephyrWorkbook, type ParsedCase } from "./zephyr";
import {
  initProjectKeyingFromKeys,
  nextCaseKey,
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

  const suiteCache = new Map<string, string>();
  let suitesCreated = 0;
  let created = 0;
  let updated = 0;
  let done = 0;

  async function ensureSuitePath(path: string[]): Promise<string> {
    const segs = path.length > 0 ? path : ["Imported"];
    let parentId: string | null = null;
    let key = opts.projectId;
    for (const name of segs) {
      key += "/" + name;
      let id: string | undefined = suiteCache.get(key);
      if (!id) {
        const existing: { id: string } | null =
          await prisma.testSuite.findFirst({
            where: { projectId: opts.projectId, parentSuiteId: parentId, name },
            select: { id: true },
          });
        if (existing) {
          id = existing.id;
        } else {
          const createdSuite: { id: string } = await prisma.testSuite.create({
            data: { projectId: opts.projectId, parentSuiteId: parentId, name },
            select: { id: true },
          });
          id = createdSuite.id;
          suitesCreated++;
        }
        suiteCache.set(key, id);
      }
      parentId = id;
    }
    return parentId as string;
  }

  for (const pc of opts.cases) {
    const suiteId = await ensureSuitePath(pc.folderPath);
    const data = caseData(pc, suiteId);

    const existing = pc.sourceKey
      ? await prisma.testCase.findUnique({
          where: { sourceKey: pc.sourceKey },
          select: { id: true },
        })
      : null;

    if (existing) {
      await prisma.testCase.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      // Imported cases keep their Zephyr key; keyless rows get a generated one.
      const key = pc.sourceKey ?? (await nextCaseKey(opts.projectId));
      await prisma.testCase.create({
        data: {
          ...data,
          key,
          keyNum: parseKey(key)?.num ?? null,
          sourceKey: pc.sourceKey,
          createdById: opts.userId,
        },
      });
      created++;
    }

    done++;
    opts.onProgress?.(done, total);
  }

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
