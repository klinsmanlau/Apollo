/**
 * Shared attachment limits and the allowed MIME types, imported by every
 * upload path (the legacy multipart route, the signed-URL sign/confirm routes,
 * and the client hint) so they can never drift out of sync.
 *
 * MAX_FILE_BYTES matches the file-size limit configured on the Supabase
 * "attachments" bucket. Supabase enforces its own limit at upload time; keeping
 * this in step just lets us reject early with a friendlier message.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PER_EXECUTION = 20;

/** Human-readable cap, e.g. "10 MB", for error messages and hints. */
export const MAX_FILE_LABEL = `${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`;

// Screenshots, logs, common report formats, and short screen recordings.
export const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov — iOS / Simulator screen recordings
]);
