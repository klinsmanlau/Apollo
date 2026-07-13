"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import type { Role } from "@prisma/client";

export type MemberResult = { ok: true } | { error: string };

const ROLES = new Set<Role>(["admin", "lead", "tester", "viewer"]);

function asRole(v: unknown): Role | null {
  return typeof v === "string" && ROLES.has(v as Role) ? (v as Role) : null;
}

/** Add a user (by email) to the project. Admin only. */
export async function addMember(
  projectId: string,
  email: string,
  role: string
): Promise<MemberResult> {
  try {
    await requireProjectRole(projectId, "admin");
  } catch {
    return { error: "Only project admins can manage members" };
  }
  const newRole = asRole(role);
  if (!newRole) return { error: "Invalid role" };

  const clean = email.trim().toLowerCase();
  if (!clean) return { error: "Email is required" };

  // Users are synced from Clerk (webhook / first sign-in), so they must have
  // signed in at least once before they can be added.
  const target = await prisma.user.findUnique({
    where: { email: clean },
    select: { id: true },
  });
  if (!target) {
    return {
      error: "No user with that email — they need to sign in to Apollo once first",
    };
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: target.id } },
    select: { id: true },
  });
  if (existing) return { error: "Already a member" };

  await prisma.projectMember.create({
    data: { projectId, userId: target.id, role: newRole },
  });
  revalidatePath(`/projects/${projectId}/members`);
  return { ok: true };
}

/**
 * True if `memberId` is the last admin-role member of the project (changing
 * or removing them would leave the project without an admin).
 */
async function isLastAdmin(projectId: string, memberId: string) {
  const m = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId },
    select: { role: true },
  });
  if (!m) return false;
  if (m.role !== "admin") return false;
  const admins = await prisma.projectMember.count({
    where: { projectId, role: "admin" },
  });
  return admins <= 1;
}

/** Change a member's project role. Admin only. */
export async function updateMemberRole(
  projectId: string,
  memberId: string,
  role: string
): Promise<MemberResult> {
  try {
    await requireProjectRole(projectId, "admin");
  } catch {
    return { error: "Only project admins can manage members" };
  }
  const newRole = asRole(role);
  if (!newRole) return { error: "Invalid role" };

  if (newRole !== "admin" && (await isLastAdmin(projectId, memberId))) {
    return { error: "A project needs at least one admin" };
  }

  const res = await prisma.projectMember.updateMany({
    where: { id: memberId, projectId },
    data: { role: newRole },
  });
  if (res.count === 0) return { error: "Member not found" };
  revalidatePath(`/projects/${projectId}/members`);
  return { ok: true };
}

/** Remove a member from the project. Admin only. */
export async function removeMember(
  projectId: string,
  memberId: string
): Promise<MemberResult> {
  try {
    await requireProjectRole(projectId, "admin");
  } catch {
    return { error: "Only project admins can manage members" };
  }

  if (await isLastAdmin(projectId, memberId)) {
    return { error: "A project needs at least one admin" };
  }

  const res = await prisma.projectMember.deleteMany({
    where: { id: memberId, projectId },
  });
  if (res.count === 0) return { error: "Member not found" };
  revalidatePath(`/projects/${projectId}/members`);
  return { ok: true };
}
