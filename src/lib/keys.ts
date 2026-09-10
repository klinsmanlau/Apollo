import { prisma } from "@/lib/prisma";

// Matches a case key like "TS-T7060" → prefix "TS", number 7060.
const KEY_RE = /^([A-Za-z][A-Za-z0-9]*)-T(\d+)$/;
// Matches a cycle key like "TS-R96" → prefix "TS", number 96.
const CYCLE_KEY_RE = /^([A-Za-z][A-Za-z0-9]*)-R(\d+)$/;

export function parseKey(key: string): { prefix: string; num: number } | null {
  const m = KEY_RE.exec(key.trim());
  return m ? { prefix: m[1].toUpperCase(), num: Number(m[2]) } : null;
}

/** Fallback prefix derived from a project name (first alphanumerics). */
export function deriveDefaultPrefix(name: string): string {
  const alnum = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return alnum.slice(0, 3) || "TC";
}

/**
 * From a list of keys, pick the dominant "<PREFIX>-T<n>" prefix and the highest
 * number for it. Used to detect the Zephyr prefix and continue its numbering.
 */
export function detectKeying(
  keys: (string | null | undefined)[]
): { prefix: string; maxNum: number } | null {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    const p = parseKey(k);
    if (p) counts.set(p.prefix, (counts.get(p.prefix) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const prefix = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let maxNum = 0;
  for (const k of keys) {
    if (!k) continue;
    const p = parseKey(k);
    if (p && p.prefix === prefix) maxNum = Math.max(maxNum, p.num);
  }
  return { prefix, maxNum };
}

/**
 * Ensure a project has a keyPrefix + caseSeq set. If unset, detect the prefix
 * from existing case keys (falling back to the project name) and seed the
 * sequence past the highest existing number. Idempotent once set.
 */
export async function ensureProjectKeying(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, keyPrefix: true },
  });
  if (!project || project.keyPrefix) return;

  const cases = await prisma.testCase.findMany({
    where: { suite: { projectId } },
    select: { key: true, sourceKey: true },
  });
  const detected = detectKeying(cases.flatMap((c) => [c.key, c.sourceKey]));
  await prisma.project.update({
    where: { id: projectId },
    data: {
      keyPrefix: detected?.prefix ?? deriveDefaultPrefix(project.name),
      caseSeq: detected?.maxNum ?? 0,
    },
  });
}

/** Seed keying directly from a set of keys (used on first import). */
export async function initProjectKeyingFromKeys(
  projectId: string,
  keys: (string | null | undefined)[]
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, keyPrefix: true },
  });
  if (!project || project.keyPrefix) return;
  const detected = detectKeying(keys);
  await prisma.project.update({
    where: { id: projectId },
    data: {
      keyPrefix: detected?.prefix ?? deriveDefaultPrefix(project.name),
      caseSeq: detected?.maxNum ?? 0,
    },
  });
}

/** Atomically allocate the next case key for a project. */
export async function nextCaseKey(projectId: string): Promise<string> {
  await ensureProjectKeying(projectId);
  const p = await prisma.project.update({
    where: { id: projectId },
    data: { caseSeq: { increment: 1 } },
    select: { caseSeq: true, keyPrefix: true, name: true },
  });
  const prefix = p.keyPrefix ?? deriveDefaultPrefix(p.name);
  return `${prefix}-T${p.caseSeq}`;
}

/**
 * Atomically allocate `count` consecutive case keys in ONE round-trip.
 * Returns e.g. ["TS-T11801", ..., "TS-T11850"]. Used for bulk case creation
 * (DeviceCloud webhook) so we don't make N sequential updates.
 */
export async function nextCaseKeys(projectId: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  await ensureProjectKeying(projectId);
  const p = await prisma.project.update({
    where: { id: projectId },
    data: { caseSeq: { increment: count } },
    select: { caseSeq: true, keyPrefix: true, name: true },
  });
  const prefix = p.keyPrefix ?? deriveDefaultPrefix(p.name);
  // caseSeq is now the LAST allocated number; the block is [end-count+1 .. end].
  const end = p.caseSeq;
  const keys: string[] = [];
  for (let n = end - count + 1; n <= end; n++) keys.push(`${prefix}-T${n}`);
  return keys;
}

/**
 * Atomically allocate the next test-cycle key for a project (e.g. TS-R96).
 * Self-heals if `cycleSeq` ever drifts behind the real max key (e.g. after a
 * database restore/migration that didn't preserve the counter in lockstep
 * with existing rows) by checking the allocated key against the table and
 * bumping straight to the true max on a collision, then retrying.
 */
export async function nextCycleKey(projectId: string): Promise<string> {
  await ensureProjectKeying(projectId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = await prisma.project.update({
      where: { id: projectId },
      data: { cycleSeq: { increment: 1 } },
      select: { cycleSeq: true, keyPrefix: true, name: true },
    });
    const prefix = p.keyPrefix ?? deriveDefaultPrefix(p.name);
    const key = `${prefix}-R${p.cycleSeq}`;
    const exists = await prisma.testRun.findUnique({ where: { key }, select: { id: true } });
    if (!exists) return key;
    await bumpCycleSeqToMax(projectId);
  }
  throw new Error("Could not allocate a unique cycle key — please retry.");
}

/** Bump the cycle sequence past the highest existing key number. Never moves
 *  the counter backward — only forward, to correct drift. */
export async function bumpCycleSeqToMax(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { keyPrefix: true, cycleSeq: true },
  });
  if (!project?.keyPrefix) return;

  const runs = await prisma.testRun.findMany({
    where: { projectId },
    select: { key: true },
  });
  let maxNum = project.cycleSeq;
  for (const r of runs) {
    const m = r.key ? CYCLE_KEY_RE.exec(r.key) : null;
    if (m && m[1].toUpperCase() === project.keyPrefix.toUpperCase()) {
      maxNum = Math.max(maxNum, Number(m[2]));
    }
  }
  if (maxNum > project.cycleSeq) {
    await prisma.project.update({
      where: { id: projectId },
      data: { cycleSeq: maxNum },
    });
  }
}

/** Bump the sequence past the highest existing key number (after imports). */
export async function bumpCaseSeqToMax(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { keyPrefix: true, caseSeq: true },
  });
  if (!project?.keyPrefix) return ensureProjectKeying(projectId);

  const cases = await prisma.testCase.findMany({
    where: { suite: { projectId } },
    select: { key: true, sourceKey: true },
  });
  let maxNum = project.caseSeq;
  for (const k of cases.flatMap((c) => [c.key, c.sourceKey])) {
    if (!k) continue;
    const p = parseKey(k);
    if (p && p.prefix === project.keyPrefix) maxNum = Math.max(maxNum, p.num);
  }
  if (maxNum > project.caseSeq) {
    await prisma.project.update({
      where: { id: projectId },
      data: { caseSeq: maxNum },
    });
  }
}
