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
