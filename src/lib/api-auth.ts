import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Auth for the public read API (`/api/v1/*`). External integrations authenticate
 * with a per-client API key sent as `Authorization: Bearer <key>`. Keys are
 * stored only as a SHA-256 hash, are scope-checked, optionally project-scoped,
 * and revocable — so each consumer is independently issued and cut off.
 *
 * This is machine-to-machine auth and is deliberately independent of the human
 * IdP (Clerk today, company SSO later): swapping the human login never touches
 * integration keys.
 */

export type ApiScope = "cases:read" | "executions:read" | "cycles:read";

/** SHA-256 hex of a raw key. The raw value is shown once at creation and never
 *  stored; lookups hash the presented key and match the stored hash. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ApiKeyContext = {
  keyId: string;
  /** The key's project scope, or null for all-projects keys. */
  projectId: string | null;
  scopes: string[];
};

type Result =
  | { ok: true; ctx: ApiKeyContext }
  | { ok: false; status: number; error: string };

/**
 * Verify the request's bearer key, that it grants `scope`, and (when a
 * `projectId` is given and the key is project-scoped) that it is authorized for
 * that project. On success, best-effort touches `lastUsedAt`.
 *
 * Errors mirror HTTP semantics: 401 for missing/invalid/revoked keys, 403 for a
 * valid key that lacks the scope or project. Callers map these to Responses.
 */
export async function requireApiKey(
  req: Request,
  scope: ApiScope,
  projectId?: string
): Promise<Result> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const hashed = hashApiKey(match[1].trim());
  // Lookup is by the hash (unique), so keys aren't enumerable via timing and we
  // never compare raw secrets in application code.
  const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } });
  if (!key || key.revokedAt) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }
  if (!key.scopes.includes(scope)) {
    return { ok: false, status: 403, error: `API key lacks scope "${scope}"` };
  }
  if (key.projectId && projectId && key.projectId !== projectId) {
    return { ok: false, status: 403, error: "API key not authorized for this project" };
  }

  // Fire-and-forget usage stamp; never block or fail the request on it.
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, ctx: { keyId: key.id, projectId: key.projectId, scopes: key.scopes } };
}

/** Clamp a `pageSize` query param to a sane bound (default 50, max 200). */
export function coercePageSize(raw: string | null, def = 50, max = 200): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(max, Math.floor(n));
}

/** Non-negative integer page index from a query param. */
export function coercePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Parse an ISO `updatedSince` filter, or undefined if absent/invalid. */
export function parseUpdatedSince(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
