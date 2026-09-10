import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import {
  storageEnabled,
  uploadToStorage,
  deleteFromStorage,
  attachmentStorageKey,
} from "@/lib/storage";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PER_EXECUTION = 20;

// Screenshots, logs and common report formats.
const ALLOWED_TYPES = new Set([
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
]);

export type AttachmentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/** Upload one or more files onto an execution (multipart form, field "files"). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; executionId: string }> }
) {
  const { projectId, executionId } = await params;
  let user;
  try {
    ({ user } = await requireProjectRole(projectId, "tester"));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const exec = await prisma.testExecution.findFirst({
    where: { id: executionId, run: { projectId } },
    select: { id: true, _count: { select: { attachmentFiles: true } } },
  });
  if (!exec) return new Response("Not found", { status: 404 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (files.length === 0) {
    return Response.json({ error: "No files provided" }, { status: 400 });
  }
  if (exec._count.attachmentFiles + files.length > MAX_PER_EXECUTION) {
    return Response.json(
      { error: `Max ${MAX_PER_EXECUTION} attachments per execution` },
      { status: 400 }
    );
  }

  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: `"${f.name}" is over the 5 MB limit` },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      return Response.json(
        { error: `"${f.name}": unsupported file type (${f.type || "unknown"})` },
        { status: 400 }
      );
    }
  }

  if (!storageEnabled()) {
    // Bytes live only in Supabase Storage (the Postgres fallback column was
    // dropped after migrating). Misconfiguration should fail loudly here.
    return Response.json(
      { error: "File storage is not configured" },
      { status: 500 }
    );
  }

  const created: AttachmentMeta[] = [];
  for (const f of files) {
    const bytes = Buffer.from(await f.arrayBuffer());
    const fileName = f.name || "attachment";

    // Upload bytes to the bucket first; the row references them by key.
    const key = attachmentStorageKey(randomUUID(), fileName);
    await uploadToStorage(key, bytes, f.type || "application/octet-stream");
    try {
      const a = await prisma.attachment.create({
        data: {
          executionId,
          fileName,
          mimeType: f.type,
          size: f.size,
          storageKey: key,
          uploadedById: user.id,
        },
        select: { id: true, fileName: true, mimeType: true, size: true },
      });
      created.push(a);
    } catch (e) {
      // Row insert failed — don't leave an orphaned object in the bucket.
      await deleteFromStorage(key).catch(() => {});
      throw e;
    }
  }

  return Response.json({ attachments: created });
}
