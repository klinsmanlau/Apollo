import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFromZephyr } from "@/lib/import/zephyr-sync";
import { syncCyclesFromZephyr } from "@/lib/import/zephyr-cycles-sync";

/**
 * Daily Zephyr Scale -> Apollo mirror, triggered by Vercel Cron (see vercel.json).
 *
 * WHY a Vercel route and not GitHub Actions: the sync is latency-bound
 * (paginated Zephyr fetch + per-row writes to the Singapore Supabase DB). A US
 * GitHub runner spends 40+ min and times out. Pinned to `sin1`, this runs
 * in-region — the same fast path the local CLI gets.
 *
 * Auth: when CRON_SECRET is set, Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>` on each invocation. We reject anything else, so the endpoint
 * can't be triggered from the public internet.
 */

export const runtime = "nodejs"; // Prisma requires the Node.js runtime
export const preferredRegion = "sin1"; // Singapore — co-located with Supabase
export const dynamic = "force-dynamic"; // never cache a sync
// ~13 min ceiling. Requires Fluid Compute enabled on the project (default for
// new Vercel projects); without it, Pro caps at 300. Lower this to 300 if the
// deploy rejects it, and if the in-region run still doesn't fit we move to a
// self-hosted in-region runner instead.
export const maxDuration = 800;

const APOLLO_PROJECT_ID = process.env.APOLLO_PROJECT_ID ?? "rytbank-qa-team";
const ZEPHYR_PROJECT_KEY = process.env.ZEPHYR_PROJECT_KEY ?? "TS";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.ZEPHYR_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "ZEPHYR_API_TOKEN not configured" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    // Attribute created cases to a project member (mirrors the CLI script).
    const project = await prisma.project.findUnique({
      where: { id: APOLLO_PROJECT_ID },
      select: { id: true, members: { select: { userId: true }, take: 1 } },
    });
    const userId = project?.members[0]?.userId;
    if (!userId) {
      return NextResponse.json(
        { error: `Apollo project "${APOLLO_PROJECT_ID}" not found or has no members` },
        { status: 500 }
      );
    }

    // Cases first — cycle executions attach to existing cases.
    const cases = await syncFromZephyr({
      projectId: APOLLO_PROJECT_ID,
      userId,
      token,
      projectKey: ZEPHYR_PROJECT_KEY,
    });

    const cycles = await syncCyclesFromZephyr({
      projectId: APOLLO_PROJECT_ID,
      token,
      projectKey: ZEPHYR_PROJECT_KEY,
    });

    const durationMs = Date.now() - startedAt;
    console.log("[zephyr-sync] done", { durationMs, cases, cycles });
    return NextResponse.json({ ok: true, durationMs, cases, cycles });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error("[zephyr-sync] failed", { durationMs, err });
    return NextResponse.json(
      { ok: false, durationMs, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
