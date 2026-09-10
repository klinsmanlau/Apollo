"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, effectiveRole, roleAtLeast } from "@/lib/auth";
import * as jira from "@/lib/jira";
import { downloadFromStorage } from "@/lib/storage";
import type { User } from "@prisma/client";

// Jira issue key shape, e.g. "APP-1234" — a project key (letters/digits,
// starting with a letter) then a dash and a number.
const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;

export type LinkedIssueRow = { id: string; issueKey: string };

/** True once the caller has at least tester access to the execution's project. */
async function assertExecutionTester(
  executionId: string,
  user: User
): Promise<string | null> {
  const ex = await prisma.testExecution.findFirst({
    where: { id: executionId },
    select: {
      id: true,
      run: {
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
  if (!ex) return "Not found";
  const role = effectiveRole(user, ex.run.project.members[0]?.role);
  if (!role || !roleAtLeast(role, "tester")) {
    return "You need the tester role to link issues";
  }
  return null;
}

/**
 * Attach an existing Jira issue key to an execution (Zephyr's "Add existing
 * issue"). When Jira is configured, the key must resolve to a real issue —
 * otherwise (Jira not configured) only its shape is checked.
 */
export async function addLinkedIssue(
  executionId: string,
  rawKey: string
): Promise<{ ok: true; issue: LinkedIssueRow } | { error: string }> {
  const user = await requireUser();
  const key = rawKey.trim().toUpperCase();
  if (!ISSUE_KEY_RE.test(key)) {
    return { error: "Enter a valid issue key, e.g. APP-1234" };
  }

  const gateError = await assertExecutionTester(executionId, user);
  if (gateError) return { error: gateError };

  if (jira.jiraEnabled()) {
    const found = await jira.getIssue(key);
    if (!found) return { error: `${key} was not found in Jira` };
  }

  const existing = await prisma.linkedIssue.findUnique({
    where: { executionId_issueKey: { executionId, issueKey: key } },
    select: { id: true },
  });
  if (existing) return { error: `${key} is already linked` };

  const issue = await prisma.linkedIssue.create({
    data: { executionId, issueKey: key, createdById: user.id },
    select: { id: true, issueKey: true },
  });
  return { ok: true, issue };
}

// ---- Create new issue (Phase B) -------------------------------------------

export async function listJiraProjects(): Promise<
  { ok: true; projects: jira.JiraProject[] } | { error: string }
> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  try {
    return { ok: true, projects: await jira.listProjects() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load Jira projects" };
  }
}

export async function listJiraIssueTypes(
  projectIdOrKey: string
): Promise<{ ok: true; issueTypes: jira.JiraIssueType[] } | { error: string }> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  try {
    return { ok: true, issueTypes: await jira.listIssueTypes(projectIdOrKey) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load issue types" };
  }
}

export async function listJiraAssignableUsers(
  projectIdOrKey: string
): Promise<{ ok: true; users: jira.JiraUser[] } | { error: string }> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  try {
    return { ok: true, users: await jira.listAssignableUsers(projectIdOrKey) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load assignable users" };
  }
}

/** The API token's own identity — used to default the Reporter field. */
export async function getJiraMyself(): Promise<
  { ok: true; user: jira.JiraUser | null } | { error: string }
> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  return { ok: true, user: await jira.getMyself() };
}

/**
 * Full field metadata for the given project + issue type — includes whether
 * each field exists at all for this pair, its real allowed values (e.g.
 * Priority's project-scoped list, which is NOT the same as Jira's site-wide
 * list — schemes vary per project), and its real default value. The client
 * picks out the specific fields it renders (Priority, Story Points) from this
 * rather than Apollo assuming a fixed list or default for either.
 */
export async function listJiraCreateFields(
  projectIdOrKey: string,
  issueTypeId: string
): Promise<{ ok: true; fields: jira.JiraCreateField[] } | { error: string }> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  try {
    return { ok: true, fields: await jira.getCreateFields(projectIdOrKey, issueTypeId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load fields" };
  }
}

/** Type-ahead search for the Parent field. */
export async function searchJiraParentCandidates(
  projectIdOrKey: string,
  query: string
): Promise<{ ok: true; issues: jira.JiraIssueRef[] } | { error: string }> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  try {
    return { ok: true, issues: await jira.searchIssuesForPicker(query, projectIdOrKey) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not search issues" };
  }
}

export type LinkedIssueInfo = {
  key: string;
  summary: string;
  status: string;
  url: string | null;
};

/**
 * Live title/status/browse-url for already-linked issue keys — fetched on
 * demand for display (the chips only persist the key), rather than cached at
 * link time, so renamed/closed issues never show stale info.
 */
export async function getLinkedIssuesInfo(
  keys: string[]
): Promise<{ ok: true; issues: LinkedIssueInfo[] } | { error: string }> {
  await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  const unique = [...new Set(keys)];
  const issues = await Promise.all(
    unique.map(async (key) => {
      const issue = await jira.getIssue(key);
      return {
        key,
        summary: issue?.summary ?? key,
        status: issue?.status ?? "",
        url: jira.issueBrowseUrl(key),
      };
    })
  );
  return { ok: true, issues };
}

/**
 * Create a Jira issue, link it to the execution, and best-effort re-upload
 * any of the execution's existing Apollo attachments the caller selected
 * (`attachmentIds`) as Jira attachments on the new issue. A failed re-upload
 * doesn't fail the whole action — the issue is already created and linked at
 * that point — its key is returned either way, with a `warning` if any
 * attachment couldn't be pushed.
 */
export async function createJiraIssueForExecution(
  executionId: string,
  input: {
    projectKeyOrId: string;
    issueTypeId: string;
    summary: string;
    description?: string;
    priorityId?: string;
    assigneeAccountId?: string;
    reporterAccountId?: string;
    parentKey?: string;
    labels?: string[];
    customFields?: { fieldId: string; value: unknown }[];
    attachmentIds?: string[];
  }
): Promise<
  { ok: true; issue: LinkedIssueRow; warning?: string } | { error: string }
> {
  const user = await requireUser();
  if (!jira.jiraEnabled()) return { error: "Jira is not configured" };
  if (!input.summary.trim()) return { error: "Summary is required" };
  if (!input.reporterAccountId) return { error: "Reporter is required" };

  const gateError = await assertExecutionTester(executionId, user);
  if (gateError) return { error: gateError };

  let created: { key: string };
  try {
    created = await jira.createIssue(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the Jira issue" };
  }

  const issue = await prisma.linkedIssue.create({
    data: { executionId, issueKey: created.key, createdById: user.id },
    select: { id: true, issueKey: true },
  });

  let warning: string | undefined;
  if (input.attachmentIds?.length) {
    // Scoped to this execution so a forged id can't pull another case's file.
    const attachments = await prisma.attachment.findMany({
      where: { id: { in: input.attachmentIds }, executionId },
      select: { fileName: true, mimeType: true, storageKey: true },
    });
    let failed = 0;
    for (const a of attachments) {
      const bytes = await downloadFromStorage(a.storageKey);
      if (!bytes) {
        failed++;
        continue;
      }
      try {
        await jira.addAttachment(created.key, {
          fileName: a.fileName,
          mimeType: a.mimeType,
          bytes,
        });
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      warning = `${created.key} was created, but ${failed} attachment${failed === 1 ? "" : "s"} could not be uploaded to Jira.`;
    }
  }

  return { ok: true, issue, warning };
}

/** Unlink an issue from an execution (does not touch Jira). */
export async function removeLinkedIssue(
  linkedIssueId: string
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();

  const link = await prisma.linkedIssue.findFirst({
    where: { id: linkedIssueId },
    select: {
      id: true,
      execution: {
        select: {
          run: {
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
      },
    },
  });
  if (!link) return { error: "Not found" };
  const role = effectiveRole(
    user,
    link.execution.run.project.members[0]?.role
  );
  if (!role || !roleAtLeast(role, "tester")) {
    return { error: "You need the tester role to unlink issues" };
  }

  await prisma.linkedIssue.delete({ where: { id: linkedIssueId } });
  return { ok: true };
}
