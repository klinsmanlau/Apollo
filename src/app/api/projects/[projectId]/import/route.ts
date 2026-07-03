import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { importCases } from "@/lib/import/run";

// Node runtime (exceljs needs it); stream progress as newline-delimited JSON.
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await requireUser();

  const member = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!member) return new Response("Not found", { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Please choose a file to import" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return Response.json({ error: "Only .xlsx files are supported" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        let lastEmit = 0;
        const summary = await importCases({
          projectId,
          userId: user.id,
          buffer,
          onStart: (total) => send({ type: "start", total }),
          onProgress: (done, total) => {
            // Throttle to ~100 updates for large imports.
            const step = Math.max(1, Math.ceil(total / 100));
            if (done === total || done - lastEmit >= step) {
              lastEmit = done;
              send({ type: "progress", done, total });
            }
          },
        });
        if (summary.total === 0) {
          send({ type: "error", error: "No test cases with a Name were found" });
        } else {
          send({ type: "done", summary });
        }
      } catch {
        send({
          type: "error",
          error: "Could not import — is it a valid Zephyr .xlsx?",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
