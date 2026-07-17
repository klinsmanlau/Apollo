import { prisma } from "@/lib/prisma";
import { nextCycleKey, parseKey } from "@/lib/keys";
import type { ExecutionStatus } from "@prisma/client";

export type DeviceCloudResult = {
  name: string;
  status: string;
  durationSeconds?: number;
  failReason?: string;
  tags?: string[];
  // Per-flow custom metadata from the Maestro YAML front matter. Values are
  // always strings. We read `properties.testCaseId` to map to existing Apollo
  // cases (against TestCase.key / sourceKey). One flow may reference several
  // cases as a comma-separated list, e.g. "TS-T125, TS-T11418".
  properties?: Record<string, string>;
};

// The `properties` key that carries the Apollo/Zephyr case key(s).
const CASE_KEY_PROP = "testCaseId";

/** Parse a case-key property value into individual keys (comma/space separated). */
function parseCaseKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[,\s]+/).map((k) => k.trim()).filter(Boolean))];
}

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
      // Automation passes get the distinct "Pass [A]" status.
      return "pass_auto";
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

  // 1) Determine each flow's referenced case key(s): prefer DeviceCloud's
  //    `properties.testCaseId` (may be a comma-separated list), falling back to
  //    a single key parsed from the flow name (e.g. "TS-T7060 login").
  const flows = results.map((r) => {
    let keys = parseCaseKeys(r.properties?.[CASE_KEY_PROP]);
    if (keys.length === 0) {
      const m = KEY_RE.exec(r.name || "");
      if (m) keys = [`${m[1].toUpperCase()}-T${m[2]}`];
    }
    return { r, keys };
  });

  // 2) One query to match every referenced key to an existing case, against
  //    key or sourceKey.
  const referencedKeys = [...new Set(flows.flatMap((f) => f.keys))];
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

  // 3) Record one execution per (flow × matched case). A flow may map to several
  //    cases; each shares the flow's status/notes. Keys with no matching case
  //    are SKIPPED (we never create cases) and reported so the mapping can be
  //    fixed on the DeviceCloud side. One execution row per case (dedup by
  //    caseId — the DB is also unique on (run, case)).
  const skipped: string[] = [];
  const execByCase = new Map<string, {
    runId: string;
    caseId: string;
    status: ExecutionStatus;
    notes: string | null;
    defectRef: string | null;
    executedAt: Date;
  }>();

  for (const f of flows) {
    if (f.keys.length === 0) {
      skipped.push(f.r.name || "(unnamed flow)");
      continue;
    }
    for (const k of f.keys) {
      const caseId = caseIdByKey.get(k);
      if (!caseId) {
        skipped.push(`${k} (${f.r.name || "unnamed flow"})`);
        continue;
      }
      // If two flows target the same case, a FAIL wins over a PASS.
      const status = mapStatus(f.r.status);
      const prior = execByCase.get(caseId);
      if (prior && prior.status === "fail") continue;
      execByCase.set(caseId, {
        runId: cycle.id,
        caseId,
        status,
        notes: f.r.failReason || null,
        defectRef: payload.console_url || null,
        executedAt: new Date(),
      });
    }
  }

  const executions = [...execByCase.values()];
  if (executions.length) {
    await prisma.testExecution.createMany({ data: executions, skipDuplicates: true });
  }

  return {
    created: true,
    cycleKey: cycle.key,
    executions: executions.length,
    skipped: skipped.length,
    skippedFlows: skipped,
  };
}
