"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import { suiteSchema } from "@/lib/validation";

export type FormState = { error?: string; ok?: boolean } | undefined;

export async function createSuite(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = suiteSchema.safeParse({
    projectId: formData.get("projectId"),
    parentSuiteId: formData.get("parentSuiteId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await requireProjectRole(parsed.data.projectId, "lead");
  } catch {
    return { error: "You need the lead role to create folders" };
  }

  await prisma.testSuite.create({
    data: {
      projectId: parsed.data.projectId,
      parentSuiteId: parsed.data.parentSuiteId || null,
      name: parsed.data.name,
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function deleteSuite(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  if (!id || !projectId) return;
  await requireProjectRole(projectId, "admin");

  // Scoped to the project so a forged id can't delete another project's suite.
  // Cascades to child suites and their cases (see schema onDelete: Cascade).
  await prisma.testSuite.deleteMany({ where: { id, projectId } });
  revalidatePath(`/projects/${projectId}`);
}
