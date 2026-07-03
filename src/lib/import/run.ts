import { prisma } from "@/lib/prisma";
import { parseZephyrWorkbook, type ParsedCase } from "./zephyr";
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
 * Parse a Zephyr workbook and import its cases, creating nested suites as
 * needed and upserting cases by sourceKey. Reports progress through the
 * callbacks so the caller can stream it to the client.
 */
export async function importCases(opts: {
  projectId: string;
  userId: string;
  buffer: ArrayBuffer | Buffer;
  onStart?: (total: number) => void;
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportSummary> {
  const parsed = await parseZephyrWorkbook(opts.buffer);
  const total = parsed.cases.length;
  opts.onStart?.(total);

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

  for (const pc of parsed.cases) {
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
      await prisma.testCase.create({
        data: { ...data, sourceKey: pc.sourceKey, createdById: opts.userId },
      });
      created++;
    }

    done++;
    opts.onProgress?.(done, total);
  }

  return {
    created,
    updated,
    suitesCreated,
    skipped: parsed.skipped,
    unmappedHeaders: parsed.unmappedHeaders,
    total,
  };
}
