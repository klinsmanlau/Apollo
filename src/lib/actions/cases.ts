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
function parseCaseForm(formData: FormData) {
  let steps: Step[] = [];
  let tags: string[] = [];
  try {
    steps = JSON.parse(String(formData.get("steps") ?? "[]"));
  } catch {
    steps = [];
  }
  try {
    tags = JSON.parse(String(formData.get("tags") ?? "[]"));
  } catch {
    tags = [];
  }

  return caseSchema.safeParse({
    suiteId: formData.get("suiteId"),
    title: formData.get("title"),
    preconditions: formData.get("preconditions"),
    steps,
    expectedResult: formData.get("expectedResult"),
    priority: formData.get("priority"),
    type: formData.get("type"),
    tags,
    externalRef: formData.get("externalRef"),
  });
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
  const d = parsed.data;

  const created = await prisma.testCase.create({
    data: {
      suiteId: d.suiteId,
      title: d.title,
      preconditions: d.preconditions || null,
      steps: d.steps,
      expectedResult: d.expectedResult || null,
      priority: d.priority,
      type: d.type,
      tags: d.tags,
      externalRef: d.externalRef || null,
      createdById: user.id,
    },
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
  const d = parsed.data;

  await prisma.testCase.update({
    where: { id: caseId },
    data: {
      suiteId: d.suiteId,
      title: d.title,
      preconditions: d.preconditions || null,
      steps: d.steps,
      expectedResult: d.expectedResult || null,
      priority: d.priority,
      type: d.type,
      tags: d.tags,
      externalRef: d.externalRef || null,
    },
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
