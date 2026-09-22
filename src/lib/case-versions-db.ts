/**
 * Server-only persistence for test-case versions. Kept separate from the
 * "use server" actions file so `createCase` and the backfill script can reuse
 * it without these internals becoming client-callable server actions.
 */

import type { Prisma, PrismaClient, CaseVersionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildSnapshot, snapshotsEqual } from "@/lib/case-versions";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Build the version pin stamped on a new execution: the case's current version
 * number plus a frozen snapshot of its authored content. Pass a case row that
 * includes `currentVersionNo` and the authored fields.
 */
export function executionPinFromCase(
  c: Record<string, unknown> & { currentVersionNo?: number }
): { caseVersionNo: number | null; caseSnapshot: Prisma.InputJsonValue } {
  return {
    caseVersionNo: typeof c.currentVersionNo === "number" ? c.currentVersionNo : null,
    caseSnapshot: buildSnapshot(c) as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Freeze the case's current authored content as a new version, bumping
 * `currentVersionNo`. When `dedupe` is set, a no-op is returned if the content
 * is identical to the latest version (Zephyr's "won't increment if unchanged").
 * Runs in a transaction so the per-case version number can't race.
 */
export async function writeCaseVersionFromCase(
  caseId: string,
  opts: {
    source: CaseVersionSource;
    note?: string | null;
    userId?: string | null;
    dedupe?: boolean;
  }
): Promise<{ versionNo: number; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.testCase.findUnique({ where: { id: caseId } });
    if (!c) throw new Error("Case not found");

    const snapshot = buildSnapshot(c as unknown as Record<string, unknown>);
    const latest = await tx.testCaseVersion.findFirst({
      where: { caseId },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true, snapshot: true },
    });

    if (
      opts.dedupe &&
      latest &&
      snapshotsEqual(
        latest.snapshot as Record<string, unknown>,
        snapshot as unknown as Record<string, unknown>
      )
    ) {
      return { versionNo: latest.versionNo, created: false };
    }

    const versionNo = (latest?.versionNo ?? 0) + 1;
    await tx.testCaseVersion.create({
      data: {
        caseId,
        versionNo,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        source: opts.source,
        note: opts.note ?? null,
        createdById: opts.userId ?? null,
      },
    });
    await tx.testCase.update({
      where: { id: caseId },
      data: { currentVersionNo: versionNo },
    });
    return { versionNo, created: true };
  });
}

/** Ensure a case has at least one version (v1), for backfills. Returns whether
 *  a version was created. Uses the passed client so it can run inside a batch. */
export async function ensureInitialVersion(
  db: Db,
  caseId: string
): Promise<boolean> {
  const existing = await db.testCaseVersion.findFirst({
    where: { caseId },
    select: { id: true },
  });
  if (existing) return false;
  const c = await db.testCase.findUnique({ where: { id: caseId } });
  if (!c) return false;
  const snapshot = buildSnapshot(c as unknown as Record<string, unknown>);
  await db.testCaseVersion.create({
    data: {
      caseId,
      versionNo: 1,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      source: "manual",
      note: "Initial version",
      createdById: (c as { createdById: string | null }).createdById ?? null,
    },
  });
  await db.testCase.update({
    where: { id: caseId },
    data: { currentVersionNo: 1 },
  });
  return true;
}
