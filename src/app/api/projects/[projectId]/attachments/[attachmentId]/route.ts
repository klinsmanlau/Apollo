import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";
import { signedUrl, deleteFromStorage } from "@/lib/storage";

export const runtime = "nodejs";

// An attachment belongs to the project through either its execution's run or
// its case's suite.
function projectScope(projectId: string, attachmentId: string) {
  return {
    id: attachmentId,
    OR: [
      { execution: { run: { projectId } } },
      { case: { suite: { projectId } } },
    ],
  };
}

/** Stream the file. Images/PDFs render inline; everything else downloads. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const { projectId, attachmentId } = await params;
  try {
    await requireProjectRole(projectId, "viewer");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const a = await prisma.attachment.findFirst({
    where: projectScope(projectId, attachmentId),
    select: { storageKey: true },
  });
  if (!a) return new Response("Not found", { status: 404 });

  // Access is gated by the role check above; the signed URL itself expires
  // in an hour, so it can't be reshared as a durable link.
  const url = await signedUrl(a.storageKey);
  if (!url) return new Response("Storage unavailable", { status: 502 });
  return Response.redirect(url, 307);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const { projectId, attachmentId } = await params;
  try {
    await requireProjectRole(projectId, "tester");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // Find first so we can clean up the bucket object after the row is gone.
  const a = await prisma.attachment.findFirst({
    where: projectScope(projectId, attachmentId),
    select: { id: true, storageKey: true },
  });
  if (!a) return new Response("Not found", { status: 404 });

  await prisma.attachment.delete({ where: { id: a.id } });
  await deleteFromStorage(a.storageKey).catch(() => {});
  return Response.json({ ok: true });
}
