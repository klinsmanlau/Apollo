"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  requireProjectRole,
  requireUser,
  effectiveRole,
  roleAtLeast,
} from "@/lib/auth";
import { caseSchema, type Step } from "@/lib/validation";
import { nextCaseKey, parseKey } from "@/lib/keys";
import type { Prisma } from "@prisma/client";

export type FormState = { error?: string } | undefined;

/**
 * Parse the case form. Steps and tags arrive as JSON strings from hidden
 * inputs maintained by the client-side editors.
 */
function parseJsonField<T>(formData: FormData, key: string, fallback: T): T {
  try {
    return JSON.parse(String(formData.get(key) ?? "")) as T;
  } catch {
    return fallback;
  }
}

function parseCaseForm(formData: FormData) {
  const steps = parseJsonField<Step[]>(formData, "steps", []);
  const tags = parseJsonField<string[]>(formData, "tags", []);
  const coverage = parseJsonField<string[]>(formData, "coverage", []);
  const estimatedTimeRaw = formData.get("estimatedTime");

  return caseSchema.safeParse({
    suiteId: formData.get("suiteId"),
    title: formData.get("title"),
    objective: formData.get("objective"),
    preconditions: formData.get("preconditions"),
    scriptType: formData.get("scriptType"),
    steps,
    scriptBody: formData.get("scriptBody"),
    expectedResult: formData.get("expectedResult"),
    priority: formData.get("priority"),
    type: formData.get("type"),
    status: formData.get("status"),
    component: formData.get("component"),
    ownerName: formData.get("ownerName"),
    estimatedTime: estimatedTimeRaw ? estimatedTimeRaw : undefined,
    tags,
    coverage,
    externalRef: formData.get("externalRef"),
  });
}

// Shared mapping from validated form data to Prisma columns.
function toCaseData(d: import("@/lib/validation").CaseInput) {
  return {
    suiteId: d.suiteId,
    title: d.title,
    objective: d.objective || null,
    preconditions: d.preconditions || null,
    scriptType: d.scriptType,
    steps: d.scriptType === "steps" ? d.steps : [],
    scriptBody: d.scriptType === "steps" ? null : d.scriptBody || null,
    expectedResult: d.expectedResult || null,
    priority: d.priority,
    type: d.type,
    status: d.status,
    component: d.component || null,
    ownerName: d.ownerName || null,
    estimatedTime: d.estimatedTime ?? null,
    tags: d.tags,
    coverage: d.coverage,
    externalRef: d.externalRef || null,
  };
}

export async function createCase(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const projectId = String(formData.get("projectId"));
  let user;
  try {
    ({ user } = await requireProjectRole(projectId, "lead"));
  } catch {
    return { error: "You need the lead role to create test cases" };
  }

  const parsed = parseCaseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // The target suite must belong to this project (suiteId comes from the form).
  const suite = await prisma.testSuite.findFirst({
    where: { id: parsed.data.suiteId, projectId },
    select: { id: true },
  });
  if (!suite) return { error: "Folder not found" };

  const key = await nextCaseKey(projectId);
  await prisma.testCase.create({
    data: {
      ...toCaseData(parsed.data),
      key,
      keyNum: parseKey(key)?.num ?? null,
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/cases/${key}`);
}

export async function updateCase(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const projectId = String(formData.get("projectId"));
  const caseId = String(formData.get("caseId"));
  try {
    await requireProjectRole(projectId, "lead");
  } catch {
    return { error: "You need the lead role to edit test cases" };
  }

  const parsed = parseCaseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Both the case and the (possibly new) suite must belong to this project.
  const [existing, suite] = await Promise.all([
    prisma.testCase.findFirst({
      where: { id: caseId, suite: { projectId } },
      select: { id: true },
    }),
    prisma.testSuite.findFirst({
      where: { id: parsed.data.suiteId, projectId },
      select: { id: true },
    }),
  ]);
  if (!existing || !suite) return { error: "Not found" };

  const updated = await prisma.testCase.update({
    where: { id: caseId },
    data: toCaseData(parsed.data),
    select: { key: true },
  });

  const dest = updated.key ?? caseId;
  revalidatePath(`/projects/${projectId}/cases/${dest}`);
  redirect(`/projects/${projectId}/cases/${dest}`);
}

/**
 * Autosave a partial update to a case (used by the inline Details / Test Script
 * editors). Only whitelisted fields are written; membership is enforced.
 */
export async function autosaveCase(
  caseId: string,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { error: string }> {
  // Hot path (autosave on blur): membership role rides along with the case
  // fetch so authorization costs no extra round trip.
  const user = await requireUser();
  const existing = await prisma.testCase.findFirst({
    where: { id: caseId },
    select: {
      id: true,
      suite: {
        select: {
          projectId: true,
          project: {
            select: {
              members: { where: { userId: user.id }, select: { role: true } },
            },
          },
        },
      },
    },
  });
  if (!existing) return { error: "Not found" };
  const role = effectiveRole(user, existing.suite.project.members[0]?.role);
  if (!role || !roleAtLeast(role, "lead")) {
    return { error: "You need the lead role to edit test cases" };
  }

  const data: Record<string, unknown> = {};
  // Nullable string fields.
  for (const f of [
    "objective",
    "preconditions",
    "component",
    "ownerName",
    "externalRef",
    "scriptBody",
  ]) {
    if (f in patch) data[f] = patch[f] ? String(patch[f]) : null;
  }
  if ("title" in patch) data.title = String(patch.title ?? "");
  if ("priority" in patch) data.priority = patch.priority;
  if ("type" in patch) data.type = patch.type;
  if ("status" in patch) data.status = patch.status;
  if ("scriptType" in patch) data.scriptType = patch.scriptType;
  if ("estimatedTime" in patch)
    data.estimatedTime =
      patch.estimatedTime == null ? null : Number(patch.estimatedTime);
  if ("tags" in patch) data.tags = patch.tags;
  if ("coverage" in patch) data.coverage = patch.coverage;
  if ("steps" in patch) data.steps = patch.steps;
  if ("customFields" in patch) data.customFields = patch.customFields;
  if ("suiteId" in patch && typeof patch.suiteId === "string") {
    const target = await prisma.testSuite.findFirst({
      where: { id: patch.suiteId, projectId: existing.suite.projectId },
      select: { id: true },
    });
    if (target) data.suiteId = patch.suiteId;
  }

  if (Object.keys(data).length === 0) return { ok: true };
  await prisma.testCase.update({
    where: { id: caseId },
    data: data as Prisma.TestCaseUncheckedUpdateInput,
  });
  return { ok: true };
}

export async function deleteCase(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId"));
  const projectId = String(formData.get("projectId"));
  if (!caseId || !projectId) return;
  await requireProjectRole(projectId, "admin");

  // Scoped so a forged id can't delete another project's case.
  await prisma.testCase.deleteMany({
    where: { id: caseId, suite: { projectId } },
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
