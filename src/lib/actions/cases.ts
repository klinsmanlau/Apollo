"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { caseSchema, type Step } from "@/lib/validation";

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
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  const parsed = parseCaseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const created = await prisma.testCase.create({
    data: { ...toCaseData(parsed.data), createdById: user.id },
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/cases/${created.id}`);
}

export async function updateCase(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireUser();
  const projectId = String(formData.get("projectId"));
  const caseId = String(formData.get("caseId"));

  const parsed = parseCaseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.testCase.update({
    where: { id: caseId },
    data: toCaseData(parsed.data),
  });

  revalidatePath(`/projects/${projectId}/cases/${caseId}`);
  redirect(`/projects/${projectId}/cases/${caseId}`);
}

export async function deleteCase(formData: FormData): Promise<void> {
  await requireUser();
  const caseId = String(formData.get("caseId"));
  const projectId = String(formData.get("projectId"));
  if (!caseId) return;

  await prisma.testCase.delete({ where: { id: caseId } });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
