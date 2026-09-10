import type { ParsedCase } from "./zephyr";
import { PRIORITY_MAP, STATUS_MAP } from "./zephyr";
import type { Step } from "@/lib/validation";

// Zephyr Scale Cloud REST API. Auth: Bearer <API access token>.
// Docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/
const BASE = "https://api.zephyrscale.smartbear.com/v2";

export type ZephyrPage<T> = {
  values: T[];
  isLast: boolean;
  next?: string | null;
  startAt: number;
  maxResults: number;
  total: number;
};

type ZephyrFolder = {
  id: number;
  name: string;
  parentId: number | null;
};

type ZephyrTestCase = {
  id: number;
  key: string;
  name: string;
  objective?: string | null;
  precondition?: string | null;
  estimatedTime?: number | null; // milliseconds in Zephyr Cloud
  labels?: string[] | null;
  priority?: { id: number } | null;
  status?: { id: number } | null;
  folder?: { id: number } | null;
  owner?: { accountId?: string; self?: string } | null;
  component?: { id: number } | null;
};

type ZephyrTestStep =
  | { inline?: { description?: string; testData?: string; expectedResult?: string } }
  | { testCase?: { self?: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function zGet<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  // Retry rate-limit (and transient 5xx) responses a few times with backoff —
  // required for the concurrent steps fetch below so a 429 doesn't silently
  // drop a case's steps.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * (attempt + 1)
      );
      continue;
    }
    const body = await res.text().catch(() => "");
    throw new Error(`Zephyr API ${res.status} ${res.statusText} for ${url}\n${body.slice(0, 500)}`);
  }
}

/** Page through a Zephyr collection endpoint until isLast. */
export async function zList<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let startAt = 0;
  const maxResults = 100;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await zGet<ZephyrPage<T>>(
      `${path}${sep}startAt=${startAt}&maxResults=${maxResults}`,
      token
    );
    out.push(...page.values);
    if (page.isLast || page.values.length === 0) break;
    startAt += page.values.length;
  }
  return out;
}

/** Build id → full path (["E2E","Rewards","Bonus"]) from the folder tree. */
function buildFolderPaths(folders: ZephyrFolder[]): Map<number, string[]> {
  const byId = new Map<number, ZephyrFolder>(folders.map((f) => [f.id, f]));
  const cache = new Map<number, string[]>();
  const resolve = (id: number, seen = new Set<number>()): string[] => {
    if (cache.has(id)) return cache.get(id)!;
    const f = byId.get(id);
    if (!f || seen.has(id)) return [];
    seen.add(id);
    const path = f.parentId != null ? [...resolve(f.parentId, seen), f.name] : [f.name];
    cache.set(id, path);
    return path;
  };
  for (const f of folders) resolve(f.id);
  return cache;
}

/** Map Zephyr's priority/status id to our enums via the fetched name lookups. */
function nameFromId<T>(
  id: number | undefined | null,
  lookup: Map<number, string>,
  map: Record<string, T>,
  fallback: T
): T {
  if (id == null) return fallback;
  const name = (lookup.get(id) ?? "").toLowerCase();
  return map[name] ?? fallback;
}

function mapSteps(steps: ZephyrTestStep[]): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    if ("inline" in s && s.inline) {
      const action = stripHtml(s.inline.description ?? "");
      if (!action && !s.inline.testData && !s.inline.expectedResult) continue;
      out.push({
        action,
        testData: stripHtml(s.inline.testData ?? "") || undefined,
        expected: stripHtml(s.inline.expectedResult ?? "") || undefined,
      });
    }
    // "testCase" steps (call-to-test) are skipped — no inline content to store.
  }
  return out;
}

/** Zephyr rich-text fields are HTML; reduce to readable plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ZephyrFetchOptions = {
  token: string;
  projectKey: string; // Jira project key, e.g. "RB"
  onProgress?: (done: number, total: number) => void;
};

/**
 * Fetch all test cases for a Jira project from Zephyr Scale Cloud and map them
 * to ParsedCase[] (the same shape the .xlsx importer produces), so they flow
 * through the shared persistCases() upsert. Preserves the Zephyr key as
 * sourceKey, reconstructs the full folder path, and pulls step-by-step scripts.
 */
export async function fetchZephyrCases(opts: ZephyrFetchOptions): Promise<ParsedCase[]> {
  const { token, projectKey } = opts;

  // 1) Folder tree → id→path, and priority/status id→name lookups.
  const [folders, priorities, statuses] = await Promise.all([
    zList<ZephyrFolder>(`/folders?projectKey=${encodeURIComponent(projectKey)}&folderType=TEST_CASE`, token),
    zList<{ id: number; name: string }>(`/priorities?projectKey=${encodeURIComponent(projectKey)}`, token),
    zList<{ id: number; name: string }>(`/statuses?projectKey=${encodeURIComponent(projectKey)}&statusType=TEST_CASE`, token),
  ]);
  const folderPaths = buildFolderPaths(folders);
  const priorityName = new Map(priorities.map((p) => [p.id, p.name]));
  const statusName = new Map(statuses.map((s) => [s.id, s.name]));

  // 2) All test cases (paginated).
  const cases = await zList<ZephyrTestCase>(
    `/testcases?projectKey=${encodeURIComponent(projectKey)}`,
    token
  );

  const total = cases.length;
  let done = 0;

  // 3) Per-case steps — the API only exposes steps one test case at a time,
  // so this is inherently a request per case. A small worker pool keeps a few
  // requests in flight (cutting the fetch phase by ~that factor) while staying
  // polite to Zephyr's rate limits; zGet retries 429s so nothing is dropped.
  // Results land by index so output order matches the case list exactly.
  const STEP_CONCURRENCY = 5;
  const stepsByIndex: Step[][] = new Array(cases.length);
  let nextIdx = 0;
  async function stepsWorker() {
    for (;;) {
      const i = nextIdx++;
      if (i >= cases.length) return;
      try {
        const stepList = await zList<ZephyrTestStep>(
          `/testcases/${cases[i].key}/teststeps`,
          token
        );
        stepsByIndex[i] = mapSteps(stepList);
      } catch {
        // Errors stay non-fatal per case, as before.
        stepsByIndex[i] = [];
      }
      done++;
      opts.onProgress?.(done, total);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(STEP_CONCURRENCY, cases.length) }, stepsWorker)
  );

  const parsed: ParsedCase[] = [];
  for (const [i, tc] of cases.entries()) {
    const steps = stepsByIndex[i] ?? [];
    const folderPath = tc.folder?.id != null ? folderPaths.get(tc.folder.id) ?? [] : [];

    parsed.push({
      sourceKey: tc.key,
      title: tc.name || tc.key,
      objective: stripHtml(tc.objective ?? "") || null,
      preconditions: stripHtml(tc.precondition ?? "") || null,
      folderPath,
      priority: nameFromId(tc.priority?.id, priorityName, PRIORITY_MAP, "medium"),
      status: nameFromId(tc.status?.id, statusName, STATUS_MAP, "draft"),
      component: null,
      ownerName: null, // Zephyr returns an accountId, not a display name
      estimatedTime: tc.estimatedTime != null ? Math.round(tc.estimatedTime / 1000) : null,
      tags: tc.labels ?? [],
      coverage: [],
      scriptType: steps.length > 0 ? "steps" : "plain",
      steps,
      scriptBody: null,
      customFields: {},
    });
  }

  return parsed;
}
