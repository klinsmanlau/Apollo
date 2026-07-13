import { prisma } from "@/lib/prisma";
import { nextCycleKey, parseKey } from "@/lib/keys";
import type { ExecutionStatus } from "@prisma/client";

export type DeviceCloudResult = {
  name: string;
  status: string;
  durationSeconds?: number;
  failReason?: string;
  // Maps the flow to an existing Apollo case. Populated on the DeviceCloud side
  // with the case's Zephyr/source key (matched against TestCase.sourceKey).
  propertiesId?: string;
};

export type DeviceCloudPayload = {
  event: string;
  upload_id: string;
  console_url?: string;
  status?: string;
  timestamp?: string;
  device?: {
    name?: string;
    osVersion?: string;
    runnerType?: string;
    maestroVersion?: string;
  };
  summary?: {
    totalTests?: number;
    passed?: number;
    failed?: number;
    durationSeconds?: number;
  };
  results?: DeviceCloudResult[];
  metadata?: Record<string, string>;
};

// Extracts an Apollo case key like "TS-T7060" from a flow name.
const KEY_RE = /\b([A-Za-z][A-Za-z0-9]*)-T(\d+)\b/;

function mapStatus(s: string | undefined): ExecutionStatus {
  switch ((s ?? "").toUpperCase()) {
    case "PASSED":
    case "PASS":
      return "pass";
    case "FAILED":
    case "FAIL":
    case "ERROR":
      return "fail";
    case "CANCELLED":
    case "CANCELED":
    case "BLOCKED":
      return "blocked";
    default:
      return "not_executed";
  }
}

async function ensureCycleFolder(projectId: string, name: string): Promise<string> {
  const existing = await prisma.cycleFolder.findFirst({
    where: { projectId, parentFolderId: null, name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.cycleFolder.create({
    data: { projectId, name },
    select: { id: true },
  });
  return created.id;
}

/**
 * Turn a completed DeviceCloud run into an Apollo test cycle: one execution per
 * flow, matched to an EXISTING case by `propertiesId` (the Zephyr/source key) or
 * a key in the flow name. Flows with no matching case are skipped and reported —
 * we never create cases here. Pass/fail status and failure reason are recorded.
 * Idempotent on upload_id.
 */
export async function ingestDeviceCloudRun(
  projectId: string,
  payload: DeviceCloudPayload
): Promise<{
  created: boolean;
  cycleKey?: string | null;
  alreadyProcessed?: boolean;
  executions?: number;
  skipped?: number;
  skippedFlows?: string[];
}> {
  if (payload.upload_id) {
    const existing = await prisma.testRun.findUnique({
      where: { externalRunId: payload.upload_id },
      select: { id: true, key: true },
    });
    if (existing) return { created: false, alreadyProcessed: true, cycleKey: existing.key };
  }

  const results = payload.results ?? [];
  const automatedFolderId = await ensureCycleFolder(projectId, "Automated");

  const device = payload.device?.name
    ? `${payload.device.name}${payload.device.osVersion ? ` · ${payload.device.osVersion}` : ""}`
    : null;
  const when = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const name =
    payload.metadata?.name ||
    payload.metadata?.cycle ||
    `DeviceCloud · ${payload.device?.name ?? "run"} · ${when.toISOString().slice(0, 10)}`;
  const description = [
    payload.console_url ? `Results: ${payload.console_url}` : null,
    device ? `Device: ${device}` : null,
    payload.device?.maestroVersion ? `Maestro: ${payload.device.maestroVersion}` : null,
    `Summary: ${payload.summary?.passed ?? 0}/${payload.summary?.totalTests ?? results.length} passed`,
  ]
    .filter(Boolean)
    .join("\n");

  const cycleKey = await nextCycleKey(projectId);
  const cycle = await prisma.testRun.create({
    data: {
      projectId,
      key: cycleKey,
      keyNum: parseKey(cycleKey)?.num ?? null,
      name,
      description,
      status: "done",
      environment: device,
      ownerName: "DeviceCloud",
      folderId: automatedFolderId,
      externalRunId: payload.upload_id || null,
    },
    select: { id: true, key: true },
  });

  // 1) Determine each flow's reference token for matching an existing case:
  //    prefer DeviceCloud's `propertiesId` (the Zephyr/source key), and fall
  //    back to a key parsed out of the flow name (e.g. "TS-T7060 login").
  const flows = results.map((r) => {
    const fromId = r.propertiesId?.trim() || null;
    const m = KEY_RE.exec(r.name || "");
    const fromName = m ? `${m[1].toUpperCase()}-T${m[2]}` : null;
    return { r, key: fromId ?? fromName };
  });

  // 2) One query to match every referenced token to an existing case. We match
  //    against sourceKey (where propertiesId points) and key (name fallback).
  const referencedKeys = [...new Set(flows.map((f) => f.key).filter((k): k is string => !!k))];
  const matched = referencedKeys.length
    ? await prisma.testCase.findMany({
        where: {
          suite: { projectId },
          OR: [{ sourceKey: { in: referencedKeys } }, { key: { in: referencedKeys } }],
        },
        select: { id: true, key: true, sourceKey: true },
      })
    : [];
  const caseIdByKey = new Map<string, string>();
  for (const c of matched) {
    if (c.key) caseIdByKey.set(c.key, c.id);
    if (c.sourceKey) caseIdByKey.set(c.sourceKey, c.id);
  }

  // 3) Record one execution per flow that matched an existing case. Flows with
  //    no matching case are SKIPPED (we never create cases) and reported back so
  //    the missing mappings can be fixed on the DeviceCloud side.
  const skippedFlows: string[] = [];
  const executions = flows
    .map((f) => {
      const caseId = f.key ? caseIdByKey.get(f.key) : undefined;
      if (!caseId) {
        skippedFlows.push(f.r.name || "(unnamed flow)");
        return null;
      }
      return {
        runId: cycle.id,
        caseId,
        status: mapStatus(f.r.status),
        notes: f.r.failReason || null,
        defectRef: payload.console_url || null,
        executedAt: new Date(),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (executions.length) {
    await prisma.testExecution.createMany({ data: executions, skipDuplicates: true });
  }

  return {
    created: true,
    cycleKey: cycle.key,
    executions: executions.length,
    skipped: skippedFlows.length,
    skippedFlows,
  };
}
