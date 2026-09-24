import { cache } from "react";
import { getSessionId, getSessionProfile } from "@/lib/auth-provider";
import { prisma } from "@/lib/prisma";
import { ensureMemberOfAllProjects } from "@/lib/onboarding";
import type { Role, User } from "@prisma/client";

/**
 * Resolve the Apollo `User` row for the currently signed-in user.
 *
 * Identity comes from the provider-neutral seam in `@/lib/auth-provider`, so
 * this (and everything downstream) is independent of which IdP is in use —
 * users are keyed by `externalAuthId`, not anything Clerk-specific.
 *
 * Wrapped in React `cache()` so multiple callers within one request (e.g. the
 * app layout and the page) share a single DB lookup instead of repeating it.
 *
 * The auth webhook (`/api/webhooks/clerk`) normally creates this row on
 * sign-up, but we upsert here as a fallback so the app works even before the
 * webhook is configured (e.g. local dev without a public tunnel).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const externalId = await getSessionId();
  if (!externalId) return null;

  const existing = await prisma.user.findUnique({
    where: { externalAuthId: externalId },
  });
  if (existing) {
    // Internal-team model: keep every user a member of every project, so a
    // project created after they signed up (including ones created directly in
    // the DB) is picked up automatically. Idempotent — only inserts what's
    // missing. Cached per request via the surrounding cache(), so this runs at
    // most once per request.
    await ensureMemberOfAllProjects(existing.id);
    return existing;
  }

  // Fallback provisioning if the webhook hasn't run yet.
  const profile = await getSessionProfile();
  if (!profile || !profile.email) return null;

  const provisioned = await prisma.user.upsert({
    where: { externalAuthId: externalId },
    update: { email: profile.email, name: profile.name },
    create: { externalAuthId: externalId, email: profile.email, name: profile.name },
  });
  // New internal accounts join every project automatically (idempotent).
  await ensureMemberOfAllProjects(provisioned.id);
  return provisioned;
});

/**
 * The local `User.id` for the signed-in user, or null — a light lookup that
 * skips the project-membership sweep in {@link getCurrentUser}. Use it on hot
 * paths (e.g. paginated API routes) that only need the id for a scoped query;
 * provisioning still happens via the app layout and the auth webhook.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const externalId = await getSessionId();
  if (!externalId) return null;
  const u = await prisma.user.findUnique({
    where: { externalAuthId: externalId },
    select: { id: true },
  });
  return u?.id ?? null;
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
 * Effective role from a membership row that was fetched alongside the entity
 * (e.g. `project: { members: { where: { userId } } }`), saving hot server
 * actions the extra role round trip.
 *
 * Internal-team model: no per-project role control — every authenticated user
 * is treated as "admin", matching {@link getProjectRole}. Args kept so callers
 * don't change.
 */
export function effectiveRole(
  _user: User,
  _memberRole: Role | null | undefined
): Role | null {
  return "admin";
}

/**
 * The user's effective role in a project.
 *
 * Internal-team model: every authenticated user has full access to every
 * project, with no per-project role control — so this always resolves to
 * "admin". (Kept async and membership-shaped so callers/signatures don't
 * change; membership rows are still maintained for member/assignee lists.)
 */
export async function getProjectRole(
  _projectId: string,
  _user: User
): Promise<Role | null> {
  return "admin";
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
