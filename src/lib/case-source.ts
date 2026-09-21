/**
 * Shared test-case library resolution.
 *
 * During the Zephyr → Apollo migration, one project holds the canonical test
 * cases — the "QA-team" project — and every other project (a POD) draws its
 * cases from that shared library instead of owning any. PODs still fully own
 * their own test cycles, executions, results and attachments; only the case
 * *definitions* are shared.
 *
 * The source project defaults to the known QA-team project id and can be
 * overridden with QA_SOURCE_PROJECT_ID. Server-only: because the override is a
 * plain (non-public) env var, don't import this into client components — pass a
 * resolved boolean/id down as a prop instead.
 */
export const QA_SOURCE_PROJECT_ID =
  process.env.QA_SOURCE_PROJECT_ID || "rytbank-qa-team";

/** The project whose test-case library `projectId` draws from. */
export function caseSourceProjectId(projectId: string): string {
  return projectId === QA_SOURCE_PROJECT_ID ? projectId : QA_SOURCE_PROJECT_ID;
}

/** True when `projectId` is a POD using another project's shared library. */
export function usesSharedLibrary(projectId: string): boolean {
  return caseSourceProjectId(projectId) !== projectId;
}
