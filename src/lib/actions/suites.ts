"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { suiteSchema } from "@/lib/validation";

export type FormState = { error?: string } | undefined;

export async function createSuite(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireUser();

  const parsed = suiteSchema.safeParse({
    projectId: formData.get("projectId"),
    parentSuiteId: formData.get("parentSuiteId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.testSuite.create({
    data: {
      projectId: parsed.data.projectId,
      parentSuiteId: parsed.data.parentSuiteId || null,
      name: parsed.data.name,
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return undefined;
}

export async function deleteSuite(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  if (!id) return;

  // Cascades to child suites and their cases (see schema onDelete: Cascade).
  await prisma.testSuite.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}
