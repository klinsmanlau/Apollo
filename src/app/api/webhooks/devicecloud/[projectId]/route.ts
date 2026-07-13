import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ingestDeviceCloudRun,
  type DeviceCloudPayload,
} from "@/lib/webhooks/devicecloud";

export const runtime = "nodejs";

function eq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function verify(header: string | null): boolean {
  const secret = process.env.DEVICECLOUD_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  // DeviceCloud sends "DeviceCloud_<secret>"; accept either form.
  return eq(header, secret) || eq(header, `DeviceCloud_${secret}`);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  if (!verify(req.headers.get("x-devicecloud-secret"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return new Response("Project not found", { status: 404 });

  const payload = (await req.json().catch(() => null)) as DeviceCloudPayload | null;
  if (!payload) return new Response("Invalid payload", { status: 400 });

  // Only act on completed runs; acknowledge anything else.
  if (payload.event !== "upload.completed") {
    return Response.json({ ok: true, ignored: payload.event ?? "unknown" });
  }

  try {
    const result = await ingestDeviceCloudRun(projectId, payload);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[devicecloud webhook] ingest failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
