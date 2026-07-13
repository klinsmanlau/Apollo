import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureMemberOfAllProjects } from "@/lib/onboarding";
import type { Role, User } from "@prisma/client";

/**
 * Resolve the Apollo `User` row for the currently signed-in Clerk user.
 *
 * Wrapped in React `cache()` so multiple callers within one request (e.g. the
 * app layout and the page) share a single DB lookup instead of repeating it.
 *
 * The Clerk webhook (`/api/webhooks/clerk`) normally creates this row on
 * sign-up, but we upsert here as a fallback so the app works even before the
 * webhook is configured (e.g. local dev without a public tunnel).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (existing) return existing;

  // Fallback provisioning if the webhook hasn't run yet.
  const clerk = await currentUser();
  if (!clerk) return null;

  const email =
    clerk.primaryEmailAddress?.emailAddress ??
    clerk.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const name =
    [clerk.firstName, clerk.lastName].filter(Boolean).join(" ") || null;

  const provisioned = await prisma.user.upsert({
    where: { clerkUserId: userId },
    update: { email, name },
    create: { clerkUserId: userId, email, name },
  });
  // New internal accounts join every project automatically (idempotent).
  await ensureMemberOfAllProjects(provisioned.id);
  return provisioned;
});

/** Like {@link getCurrentUser} but throws if there is no signed-in user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  tester: 1,
  lead: 2,
  admin: 3,
};

/** True if `role` is at least `min` in the role hierarchy. */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** True if `user` has at least the given role in the global role hierarchy. */
export function hasRole(user: User, min: Role): boolean {
  return roleAtLeast(user.role, min);
}

/**
 * The user's effective role in a project, or null if not a member.
 * Global admins (`User.role == admin`) are treated as admin everywhere.
 */
export async function getProjectRole(
  projectId: string,
  user: User
): Promise<Role | null> {
  if (user.role === "admin") return "admin";
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/**
 * Require the signed-in user to be a member of `projectId` with at least
 * `min` role. Throws "Forbidden" otherwise (non-members get the same error
 * as under-privileged members so project existence isn't leaked).
 */
export async function requireProjectRole(
  projectId: string,
  min: Role
): Promise<{ user: User; role: Role }> {
  const user = await requireUser();
  const role = await getProjectRole(projectId, user);
  if (!role || !roleAtLeast(role, min)) throw new Error("Forbidden");
  return { user, role };
}
