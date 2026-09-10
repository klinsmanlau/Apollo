/**
 * Jira Cloud REST API (v3) client. Config-gated like `@/lib/storage`: every
 * export reports "not configured" cleanly when the env vars are absent, so
 * callers (server actions) can fall back to format-only issue-key validation
 * rather than throwing.
 *
 * Auth: HTTP Basic with the reporter's email + an API token (Jira Cloud's
 * documented method — https://id.atlassian.com/manage-profile/security/api-tokens).
 * Server-only: never import this into client code, the token must not reach
 * the browser.
 */

export type JiraProject = { id: string; key: string; name: string };
export type JiraIssueType = { id: string; name: string; iconUrl?: string };
export type JiraIssue = { key: string; summary: string; status: string };
export type JiraUser = { accountId: string; displayName: string; avatarUrl?: string };
export type JiraIssueRef = { key: string; summaryText: string };
/**
 * A createmeta field descriptor for one project + issue type combination —
 * the source of truth for what Jira actually shows for that pair. Nothing
 * about a field (whether it exists, its options, its default) is assumed;
 * it's always read from here, matching Zephyr/Jira's own conditional fields.
 */
export type JiraCreateField = {
  fieldId: string;
  name: string;
  required: boolean;
  schemaType: string; // e.g. "number", "string", "user", "array", "priority"
  /** Scoped to this project + issue type — e.g. Priority's real 4-or-5-tier
   *  list, which differs by project priority scheme. */
  allowedValues?: { id: string; name: string }[];
  hasDefaultValue: boolean;
  /** Shape depends on schemaType — {id,name} for priority, a raw value for
   *  numbers/strings. */
  defaultValue?: unknown;
};

function config(): { baseUrl: string; email: string; token: string } | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, token };
}

export function jiraEnabled(): boolean {
  return config() !== null;
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const c = config();
  if (!c) throw new Error("Jira is not configured");
  const auth = Buffer.from(`${c.email}:${c.token}`).toString("base64");
  const res = await fetch(`${c.baseUrl}/rest/api/3${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API ${res.status}: ${body.slice(0, 300) || res.statusText}`);
  }
  // 204 No Content etc.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Projects the API token's user can create issues in. */
export async function listProjects(): Promise<JiraProject[]> {
  const data = await jiraFetch<{
    values: { id: string; key: string; name: string }[];
  }>("/project/search?orderBy=name&maxResults=100");
  return data.values.map((p) => ({ id: p.id, key: p.key, name: p.name }));
}

/** Issue types selectable when creating an issue in the given project. */
export async function listIssueTypes(
  projectIdOrKey: string
): Promise<JiraIssueType[]> {
  const data = await jiraFetch<{
    issueTypes: { id: string; name: string; iconUrl?: string; subtask: boolean }[];
  }>(`/issue/createmeta/${encodeURIComponent(projectIdOrKey)}/issuetypes`);
  return data.issueTypes
    .filter((t) => !t.subtask)
    .map((t) => ({ id: t.id, name: t.name, iconUrl: t.iconUrl }));
}

/** Users assignable to issues in the given project. */
export async function listAssignableUsers(
  projectKeyOrId: string
): Promise<JiraUser[]> {
  const data = await jiraFetch<
    { accountId: string; displayName: string; avatarUrls?: Record<string, string> }[]
  >(
    `/user/assignable/search?project=${encodeURIComponent(projectKeyOrId)}&maxResults=50`
  );
  return data.map((u) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    avatarUrl: u.avatarUrls?.["24x24"],
  }));
}

/** The API token's own identity — Jira's default Reporter when none is set. */
export async function getMyself(): Promise<JiraUser | null> {
  try {
    const data = await jiraFetch<{
      accountId: string;
      displayName: string;
      avatarUrls?: Record<string, string>;
    }>("/myself");
    return {
      accountId: data.accountId,
      displayName: data.displayName,
      avatarUrl: data.avatarUrls?.["24x24"],
    };
  } catch {
    return null;
  }
}

/**
 * Field metadata for one project + issue type — this is how fields like
 * "Priority" (whose allowed values are a per-project scheme, not a fixed
 * global list) and "Story Points" (a custom field whose internal id differs
 * per Jira site) are discovered, rather than assumed. Callers match on `name`
 * for the specific fields Apollo exposes.
 */
export async function getCreateFields(
  projectIdOrKey: string,
  issueTypeId: string
): Promise<JiraCreateField[]> {
  const data = await jiraFetch<{
    fields: {
      fieldId: string;
      name: string;
      required: boolean;
      schema: { type: string };
      allowedValues?: { id: string; name: string }[];
      hasDefaultValue?: boolean;
      defaultValue?: unknown;
    }[];
  }>(
    `/issue/createmeta/${encodeURIComponent(projectIdOrKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`
  );
  return data.fields.map((f) => ({
    fieldId: f.fieldId,
    name: f.name,
    required: f.required,
    schemaType: f.schema?.type,
    allowedValues: f.allowedValues?.map((v) => ({ id: v.id, name: v.name })),
    hasDefaultValue: f.hasDefaultValue ?? false,
    defaultValue: f.defaultValue,
  }));
}

/** Type-ahead search for the Parent field (Jira's own picker endpoint). */
export async function searchIssuesForPicker(
  query: string,
  projectId?: string
): Promise<JiraIssueRef[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ query });
  if (projectId) params.set("currentProjectId", projectId);
  const data = await jiraFetch<{
    sections: { issues: { key: string; summaryText: string }[] }[];
  }>(`/issue/picker?${params}`);
  const seen = new Set<string>();
  const out: JiraIssueRef[] = [];
  for (const section of data.sections) {
    for (const issue of section.issues) {
      if (seen.has(issue.key)) continue;
      seen.add(issue.key);
      // summaryText comes with the query fragment wrapped in <b> — plain text is enough here.
      out.push({ key: issue.key, summaryText: issue.summaryText.replace(/<\/?b>/g, "") });
    }
  }
  return out;
}

/** Minimal Atlassian Document Format doc: one paragraph per non-empty line. */
function textToAdf(text: string) {
  const paragraphs = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: paragraphs.length
      ? paragraphs.map((line) => ({
          type: "paragraph",
          content: [{ type: "text", text: line }],
        }))
      : [{ type: "paragraph", content: [] }],
  };
}

/**
 * Create an issue. `description` is plain text (converted to ADF paragraphs) —
 * this is a deliberate v1 simplification; the Apollo Actual Result editor's
 * rich HTML (tables, images, lists) isn't translated to ADF, only its text.
 */
export async function createIssue(opts: {
  projectKeyOrId: string;
  issueTypeId: string;
  summary: string;
  description?: string;
  priorityId?: string;
  assigneeAccountId?: string;
  reporterAccountId?: string;
  parentKey?: string;
  labels?: string[];
  /** Story Points etc. — { fieldId, value } pairs resolved via getCreateFields. */
  customFields?: { fieldId: string; value: unknown }[];
}): Promise<{ key: string }> {
  const custom: Record<string, unknown> = {};
  for (const f of opts.customFields ?? []) custom[f.fieldId] = f.value;

  const data = await jiraFetch<{ key: string }>("/issue", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        project: { key: opts.projectKeyOrId },
        issuetype: { id: opts.issueTypeId },
        summary: opts.summary,
        ...(opts.description
          ? { description: textToAdf(opts.description) }
          : {}),
        ...(opts.priorityId ? { priority: { id: opts.priorityId } } : {}),
        ...(opts.assigneeAccountId
          ? { assignee: { accountId: opts.assigneeAccountId } }
          : {}),
        ...(opts.reporterAccountId
          ? { reporter: { accountId: opts.reporterAccountId } }
          : {}),
        ...(opts.parentKey ? { parent: { key: opts.parentKey } } : {}),
        ...(opts.labels?.length ? { labels: opts.labels } : {}),
        ...custom,
      },
    }),
  });
  return { key: data.key };
}

/**
 * Attach a file to an existing issue. Uses a raw fetch (not `jiraFetch`) since
 * multipart uploads must NOT set a JSON Content-Type — fetch sets the
 * multipart boundary itself from the FormData body. Jira also requires the
 * `X-Atlassian-Token` header on this endpoint specifically.
 */
export async function addAttachment(
  issueKeyOrId: string,
  file: { fileName: string; mimeType: string; bytes: Buffer }
): Promise<void> {
  const c = config();
  if (!c) throw new Error("Jira is not configured");
  const auth = Buffer.from(`${c.email}:${c.token}`).toString("base64");
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
    file.fileName
  );
  const res = await fetch(
    `${c.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKeyOrId)}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "X-Atlassian-Token": "no-check",
      },
      body: form,
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira attachment upload failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

/** Look up an issue by key (validates existence + shows summary/status). */
export async function getIssue(key: string): Promise<JiraIssue | null> {
  try {
    const data = await jiraFetch<{
      key: string;
      fields: { summary: string; status: { name: string } };
    }>(`/issue/${encodeURIComponent(key)}?fields=summary,status`);
    return { key: data.key, summary: data.fields.summary, status: data.fields.status.name };
  } catch {
    return null;
  }
}

/** Public "browse" URL for a Jira issue — for outbound links from Apollo's UI. */
export function issueBrowseUrl(key: string): string | null {
  const c = config();
  if (!c) return null;
  return `${c.baseUrl}/browse/${encodeURIComponent(key)}`;
}
