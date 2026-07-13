"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { projectSchema } from "@/lib/validation";

export type FormState = { error?: string } | undefined;

export async function createProject(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      // Creator is automatically a member and administers their project.
      members: { create: { userId: user.id, role: "admin" } },
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
