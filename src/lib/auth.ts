import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Role, User } from "@prisma/client";

/**
 * Resolve the Apollo `User` row for the currently signed-in Clerk user.
 *
 * The Clerk webhook (`/api/webhooks/clerk`) normally creates this row on
 * sign-up, but we upsert here as a fallback so the app works even before the
 * webhook is configured (e.g. local dev without a public tunnel).
 */
export async function getCurrentUser(): Promise<User | null> {
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

  return prisma.user.upsert({
    where: { clerkUserId: userId },
    update: { email, name },
    create: { clerkUserId: userId, email, name },
  });
}

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

/** True if `user` has at least the given role in the global role hierarchy. */
export function hasRole(user: User, min: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}
