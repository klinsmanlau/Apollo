import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * The ONE module that talks to the auth provider (currently Clerk) for identity.
 *
 * Everything else in the app resolves users through `@/lib/auth`
 * (`getCurrentUser` / `requireUser`), which builds on the provider-neutral
 * shapes below. To migrate to company SSO, reimplement just these two functions
 * against the new provider (OIDC/SAML) — no other file imports the provider SDK
 * for identity, so the blast radius of the swap is this file plus the UI-level
 * bits (middleware, layout provider, sign-in screens).
 */

export type SessionProfile = {
  /** The IdP's stable subject/user id (Clerk user id today). */
  externalId: string;
  email: string | null;
  name: string | null;
};

/**
 * The signed-in user's external (IdP) id, or null when unauthenticated.
 * Cheap — no profile fetch; use this for the common "who is this" lookup.
 */
export async function getSessionId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * Full profile for provisioning a local user row, or null if not signed in.
 * Heavier than {@link getSessionId} (fetches the provider profile), so call it
 * only when a local row is missing and must be created.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const u = await currentUser();
  if (!u) return null;
  const email =
    u.primaryEmailAddress?.emailAddress ??
    u.emailAddresses[0]?.emailAddress ??
    null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
  return { externalId: u.id, email, name };
}
