"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, effectiveRole, roleAtLeast } from "@/lib/auth";
import { writeCaseVersionFromCase } from "@/lib/case-versions-db";
import { buildSnapshot, CASE_AUTHORED_FIELDS } from "@/lib/case-versions";

type Result = { error: string } | { ok: true; versionNo: number; created: boolean };

/** Load the case with the caller's project role, enforcing lead access. */
async function requireCaseLead(caseId: string) {
  const user = await requireUser();
  const existing = await prisma.testCase.findFirst({
    where: { id: caseId },
    select: {
      id: true,
      key: true,
      suite: {
        select: {
          projectId: true,
          project: {
            select: {
              members: { where: { userId: user.id }, select: { role: true } },
            },
          },
        },
      },
    },
  });
  if (!existing) return { ok: false as const, error: "Not found" };
  const role = effectiveRole(user, existing.suite.project.members[0]?.role);
  if (!role || !roleAtLeast(role, "lead")) {
    return { ok: false as const, error: "You need the lead role to manage versions" };
  }
  return {
    ok: true as const,
    user,
    projectId: existing.suite.projectId,
    key: existing.key,
  };
}

/** Freeze the case's current content as a new version (explicit "Create new
 *  version"). No-ops when nothing changed since the latest version. */
export async function createCaseVersion(
  caseId: string,
  note?: string
): Promise<Result> {
  const ctx = await requireCaseLead(caseId);
  if (!ctx.ok) return { error: ctx.error };

  const { versionNo, created } = await writeCaseVersionFromCase(caseId, {
    source: "manual",
    note: note?.trim() || null,
    userId: ctx.user.id,
    dedupe: true,
  });

  revalidatePath(`/projects/${ctx.projectId}/cases/${ctx.key ?? caseId}`);
  return { ok: true, versionNo, created };
}

/** Restore an earlier version: copy its authored content onto the working head
 *  and record a new "restore" version so history stays append-only. */
export async function restoreCaseVersion(
  caseId: string,
  versionNo: number
): Promise<Result> {
  const ctx = await requireCaseLead(caseId);
  if (!ctx.ok) return { error: ctx.error };

  const target = await prisma.testCaseVersion.findUnique({
    where: { caseId_versionNo: { caseId, versionNo } },
    select: { snapshot: true },
  });
  if (!target) return { error: "Version not found" };

  // Apply only the authored fields from the snapshot onto the live case; never
  // touch identity (key), location (suiteId), or lifecycle (archived) columns.
  const snap = buildSnapshot(target.snapshot as Record<string, unknown>);
  const data: Prisma.TestCaseUncheckedUpdateInput = {};
  for (const f of CASE_AUTHORED_FIELDS) {
    (data as Record<string, unknown>)[f] = snap[f] as unknown;
  }
  await prisma.testCase.update({ where: { id: caseId }, data });

  const res = await writeCaseVersionFromCase(caseId, {
    source: "restore",
    note: `Restored from v${versionNo}`,
    userId: ctx.user.id,
    dedupe: false,
  });

  revalidatePath(`/projects/${ctx.projectId}/cases/${ctx.key ?? caseId}`);
  return { ok: true, versionNo: res.versionNo, created: res.created };
}
