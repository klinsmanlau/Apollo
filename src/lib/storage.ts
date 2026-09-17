import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage for attachment bytes. All attachment files live in the
 * private "attachments" bucket, referenced by `Attachment.storageKey` — the
 * old Postgres `data` column was dropped once every row was migrated (see
 * prisma/migrate-attachments-to-storage.ts).
 *
 * `storageEnabled()` lets callers fail fast with a clear error if the
 * service-role key is ever missing, rather than a confusing Supabase SDK
 * error deep in an upload. The service-role client is server-only (never
 * import this into client code) — it bypasses RLS, which is why the bucket
 * must stay private.
 */

export const ATTACHMENTS_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "attachments";

// URL is derivable from the Postgres host's project ref, but an explicit
// SUPABASE_URL wins if set.
function supabaseUrl(): string | null {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  const ref = (process.env.DATABASE_URL || "").match(
    /postgres\.([a-z0-9]+):/i
  )?.[1];
  return ref ? `https://${ref}.supabase.co` : null;
}

let cached: SupabaseClient | null | undefined;

/** The storage client, or null when storage isn't configured. */
export function storageClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;
  return cached;
}

export function storageEnabled(): boolean {
  return storageClient() !== null;
}

/** Deterministic object key for an attachment. */
export function attachmentStorageKey(id: string, fileName: string): string {
  // Keep the extension for correct content-type sniffing on download.
  const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
  return `executions/${id}${ext}`;
}

/** Upload bytes; returns the stored object key. Throws if storage is off. */
export async function uploadToStorage(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const client = storageClient();
  if (!client) throw new Error("Storage not configured");
  const { error } = await client.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(key, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return key;
}

/**
 * A single-use signed URL the browser can upload one object to, without our
 * service-role key ever leaving the server. This is how large files (videos)
 * reach Supabase directly, bypassing the ~4.5 MB request-body limit on our
 * own serverless functions. The URL is bound to `key` and expires quickly.
 */
export async function signedUploadUrl(
  key: string
): Promise<{ url: string; token: string } | null> {
  const client = storageClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(key);
  if (error || !data) return null;
  return { url: data.signedUrl, token: data.token };
}

/**
 * Read a stored object's authoritative size (and content-type), or null if it
 * isn't there. Used to verify a direct upload actually landed and to record its
 * real size — never trust a size the client claims.
 */
export async function statObject(
  key: string
): Promise<{ size: number; mimeType: string } | null> {
  const client = storageClient();
  if (!client) return null;
  const slash = key.lastIndexOf("/");
  const folder = slash >= 0 ? key.slice(0, slash) : "";
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  const { data, error } = await client.storage
    .from(ATTACHMENTS_BUCKET)
    .list(folder, { search: name, limit: 100 });
  if (error || !data) return null;
  const obj = data.find((o) => o.name === name);
  if (!obj) return null;
  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  return {
    size: typeof meta.size === "number" ? meta.size : 0,
    mimeType: meta.mimetype || "application/octet-stream",
  };
}

/** A short-lived signed URL for a private object (default 1h). */
export async function signedUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const client = storageClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}

/** Download an object's bytes (e.g. to re-attach it to a Jira issue). */
export async function downloadFromStorage(key: string): Promise<Buffer | null> {
  const client = storageClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(ATTACHMENTS_BUCKET).download(key);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Remove an object; best-effort (a missing object is not an error to us). */
export async function deleteFromStorage(key: string): Promise<void> {
  const client = storageClient();
  if (!client) return;
  await client.storage.from(ATTACHMENTS_BUCKET).remove([key]);
}
