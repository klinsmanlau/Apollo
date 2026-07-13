import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/auth";

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
  });
  if (!a) return new Response("Not found", { status: 404 });

  const inline =
    a.mimeType.startsWith("image/") ||
    a.mimeType.startsWith("video/") ||
    a.mimeType === "application/pdf" ||
    a.mimeType.startsWith("text/");
  const disposition = inline ? "inline" : "attachment";
  // RFC 5987 encoding so odd characters in file names survive the header.
  const safeName = encodeURIComponent(a.fileName).replace(/['()]/g, escape);

  return new Response(Buffer.from(a.data), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(a.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${safeName}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
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

  const res = await prisma.attachment.deleteMany({
    where: projectScope(projectId, attachmentId),
  });
  if (res.count === 0) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}
