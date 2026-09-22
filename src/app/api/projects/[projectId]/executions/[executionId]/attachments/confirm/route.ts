import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import { statObject, deleteFromStorage } from "@/lib/storage";
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_PER_EXECUTION,
  ALLOWED_TYPES,
} from "@/lib/attachments";
import type { AttachmentMeta } from "../route";

export const runtime = "nodejs";

/**
 * Phase 2 of a direct-to-storage upload: the browser has PUT the bytes straight
 * to Supabase, so record the attachment — but verify against the *stored*
 * object, never the client's claims. The size is read back from storage; if it
 * somehow exceeds the cap (or the object is missing) we discard it and refuse.
 */
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
    select: { id: true },
  });
  if (!exec) return new Response("Not found", { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    key?: string;
    fileName?: string;
    mimeType?: string;
    inline?: boolean;
  } | null;
  const key = body?.key || "";
  const fileName = (body?.fileName || "attachment").slice(0, 200);
  const mimeType = body?.mimeType || "";
  const inline = body?.inline === true;

  // The key must be one we mint (random UUID under executions/); this also stops
  // a client pointing a row at an arbitrary storage path.
  if (!/^executions\/[^/]+$/.test(key)) {
    return Response.json({ error: "Invalid upload key" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(mimeType)) {
    return Response.json(
      { error: `Unsupported file type (${mimeType || "unknown"})` },
      { status: 400 }
    );
  }

  // Authoritative size from storage — a missing object means the PUT failed.
  const stat = await statObject(key);
  if (!stat) {
    return Response.json(
      { error: "Upload did not complete — please try again" },
      { status: 400 }
    );
  }
  if (stat.size > MAX_FILE_BYTES) {
    await deleteFromStorage(key).catch(() => {});
    return Response.json(
      { error: `"${fileName}" is over the ${MAX_FILE_LABEL} limit` },
      { status: 400 }
    );
  }
  if (!inline) {
    const count = await prisma.attachment.count({
      where: { executionId, inline: false },
    });
    if (count >= MAX_PER_EXECUTION) {
      await deleteFromStorage(key).catch(() => {});
      return Response.json(
        { error: `Max ${MAX_PER_EXECUTION} attachments per execution` },
        { status: 400 }
      );
    }
  }

  try {
    const a: AttachmentMeta = await prisma.attachment.create({
      data: {
        executionId,
        fileName,
        mimeType,
        size: stat.size,
        storageKey: key,
        uploadedById: user.id,
        inline,
      },
      select: { id: true, fileName: true, mimeType: true, size: true },
    });
    return Response.json({ attachment: a });
  } catch (e) {
    // Row insert failed — don't leave an orphaned object in the bucket.
    await deleteFromStorage(key).catch(() => {});
    throw e;
  }
}
