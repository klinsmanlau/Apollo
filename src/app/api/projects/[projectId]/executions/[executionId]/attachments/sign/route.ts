import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import {
  storageEnabled,
  signedUploadUrl,
  attachmentStorageKey,
} from "@/lib/storage";
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_PER_EXECUTION,
  ALLOWED_TYPES,
} from "@/lib/attachments";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/**
 * Phase 1 of a direct-to-storage upload: validate the declared file against our
 * limits, then hand back a single-use signed URL the browser PUTs the bytes to.
 * Large files (videos) never pass through this function, so they dodge Vercel's
 * ~4.5 MB request-body cap. The bytes are only recorded once /confirm verifies
 * the stored object, so a signed URL that's never used just expires harmlessly.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; executionId: string }> }
) {
  const { projectId, executionId } = await params;
  try {
    await requireProjectRole(projectId, "tester");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const exec = await prisma.testExecution.findFirst({
    where: { id: executionId, run: { projectId } },
    select: { id: true, _count: { select: { attachmentFiles: true } } },
  });
  if (!exec) return new Response("Not found", { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    fileName?: string;
    mimeType?: string;
    size?: number;
  } | null;
  const fileName = (body?.fileName || "attachment").slice(0, 200);
  const mimeType = body?.mimeType || "";
  const size = typeof body?.size === "number" ? body.size : 0;

  if (!ALLOWED_TYPES.has(mimeType)) {
    return Response.json(
      { error: `"${fileName}": unsupported file type (${mimeType || "unknown"})` },
      { status: 400 }
    );
  }
  if (size <= 0 || size > MAX_FILE_BYTES) {
    return Response.json(
      { error: `"${fileName}" is over the ${MAX_FILE_LABEL} limit` },
      { status: 400 }
    );
  }
  // Best-effort early gate; /confirm re-checks under the real count.
  if (exec._count.attachmentFiles >= MAX_PER_EXECUTION) {
    return Response.json(
      { error: `Max ${MAX_PER_EXECUTION} attachments per execution` },
      { status: 400 }
    );
  }

  if (!storageEnabled()) {
    return Response.json(
      { error: "File storage is not configured" },
      { status: 500 }
    );
  }

  const key = attachmentStorageKey(randomUUID(), fileName);
  const signed = await signedUploadUrl(key);
  if (!signed) {
    return Response.json({ error: "Could not prepare upload" }, { status: 500 });
  }

  return Response.json({ key, uploadUrl: signed.url });
}
