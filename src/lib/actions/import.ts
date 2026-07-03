"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseZephyrWorkbook, type ParsedCase } from "@/lib/import/zephyr";
import type { Prisma } from "@prisma/client";

export type ImportSummary = {
  created: number;
  updated: number;
  suitesCreated: number;
  skipped: number;
  unmappedHeaders: string[];
};

export type ImportState =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string }
  | undefined;

/** Ensure the nested suite path exists, creating missing levels. Returns leaf id. */
async function ensureSuitePath(
  projectId: string,
  path: string[],
  cache: Map<string, string>,
  counter: { created: number }
): Promise<string> {
  const segments = path.length > 0 ? path : ["Imported"];
  let parentId: string | null = null;
  let key = projectId;

  for (const name of segments) {
    key += "/" + name;
    let id: string | undefined = cache.get(key);
    if (!id) {
      const existing: { id: string } | null =
        await prisma.testSuite.findFirst({
          where: { projectId, parentSuiteId: parentId, name },
          select: { id: true },
        });
      if (existing) {
        id = existing.id;
      } else {
        const createdSuite: { id: string } = await prisma.testSuite.create({
          data: { projectId, parentSuiteId: parentId, name },
          select: { id: true },
        });
        id = createdSuite.id;
        counter.created++;
      }
      cache.set(key, id);
    }
    parentId = id;
  }
  return parentId as string;
}

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

export async function importZephyr(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  // Authorization: must be a member of the target project.
  const member = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "Project not found" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a file to import" };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx files are supported" };
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = await parseZephyrWorkbook(buf);
  } catch {
    return { ok: false, error: "Could not read the workbook — is it a valid .xlsx?" };
  }

  if (parsed.cases.length === 0) {
    return { ok: false, error: "No test cases with a Name were found in the sheet" };
  }

  const suiteCache = new Map<string, string>();
  const suiteCounter = { created: 0 };
  let created = 0;
  let updated = 0;

  for (const pc of parsed.cases) {
    const suiteId = await ensureSuitePath(
      projectId,
      pc.folderPath,
      suiteCache,
      suiteCounter
    );
    const data = caseData(pc, suiteId);

    // Idempotent on sourceKey when present; otherwise always create.
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
        data: { ...data, sourceKey: pc.sourceKey, createdById: user.id },
      });
      created++;
    }
  }

  revalidatePath(`/projects/${projectId}`);
  return {
    ok: true,
    summary: {
      created,
      updated,
      suitesCreated: suiteCounter.created,
      skipped: parsed.skipped,
      unmappedHeaders: parsed.unmappedHeaders,
    },
  };
}
