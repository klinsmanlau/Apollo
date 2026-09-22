import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { Step } from "@/lib/validation";
import type { Priority } from "@prisma/client";
import { caseSourceProjectId } from "@/lib/case-source";
import { buildSnapshot } from "@/lib/case-versions";
import { TestPlayer, type PlayerData, VIEW_COOKIE } from "./test-player";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ projectId: string; cycleKey: string }>;
}) {
  const { projectId, cycleKey } = await params;
  const user = await requireUser();

  // Seed the Test Player's view preferences from the cookie so SSR matches the
  // client's first paint (no reset flash). Value is "<groupBy>.<0|1>".
  const [viewGroupBy, viewAssigned] = (
    (await cookies()).get(VIEW_COOKIE)?.value ?? ""
  ).split(".");

  const [cycle, members, project] = await Promise.all([
    prisma.testRun.findFirst({
      where: {
        project: { id: projectId, members: { some: { userId: user.id } } },
        OR: [{ key: cycleKey }, { id: cycleKey }],
      },
      include: {
        executions: {
          include: {
            case: {
              select: {
                id: true,
                key: true,
                title: true,
                priority: true,
                component: true,
                objective: true,
                preconditions: true,
                steps: true,
                estimatedTime: true,
                suite: { select: { name: true } },
              },
            },
            executedBy: { select: { name: true, email: true } },
            attachmentFiles: {
              // Inline media (embedded in a step's rich text) isn't a panel
              // attachment — it lives in the step and is managed there.
              where: { inline: false },
              select: { id: true, fileName: true, mimeType: true, size: true },
              orderBy: { createdAt: "asc" },
            },
            linkedIssues: {
              select: { id: true, issueKey: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { keyPrefix: true },
    }),
  ]);
  if (!cycle) notFound();

  const data: PlayerData = {
    cycle: {
      id: cycle.id,
      key: cycle.key,
      name: cycle.name,
      startDate: cycle.startDate ? cycle.startDate.toISOString().slice(0, 10) : "",
      endDate: cycle.endDate ? cycle.endDate.toISOString().slice(0, 10) : "",
    },
    users: members.map((m) => m.user),
    executions: cycle.executions.map((e) => {
      // Render against the version this execution was pinned to (frozen at
      // add-to-cycle time), so its stepResults stay aligned with the exact
      // steps that were run. Legacy rows with no snapshot use the live case.
      const pinned = e.caseSnapshot
        ? buildSnapshot(e.caseSnapshot as Record<string, unknown>)
        : null;
      return {
        id: e.id,
        status: e.status,
        notes: e.notes,
        defectRef: e.defectRef,
        linkedIssues: e.linkedIssues,
        stepResults: (e.stepResults as unknown as { status: string }[]) ?? [],
        environment: e.environment,
        iteration: e.iteration,
        releaseVersion: e.releaseVersion,
        assignedToId: e.assignedToId,
        assignedToName: e.assignedToName,
        actualTime: e.actualTime,
        executedByName: e.executedBy?.name ?? e.executedBy?.email ?? null,
        caseId: e.case.id,
        caseKey: e.case.key,
        caseVersionNo: e.caseVersionNo,
        caseTitle: pinned ? pinned.title : e.case.title,
        casePriority: (pinned ? pinned.priority : e.case.priority) as Priority,
        caseComponent: pinned ? pinned.component : e.case.component,
        caseFolder: e.case.suite?.name ?? null,
        caseObjective: pinned ? pinned.objective : e.case.objective,
        casePreconditions: pinned ? pinned.preconditions : e.case.preconditions,
        caseSteps: pinned
          ? (pinned.steps as Step[])
          : ((e.case.steps as unknown as Step[]) ?? []),
        caseEstimatedTime: pinned ? pinned.estimatedTime : e.case.estimatedTime,
        attachments: e.attachmentFiles,
      };
    }),
  };

  return (
    <div className="h-full">
      {/* TestPlayer reads the ?exec= deep link via useSearchParams, which
          Next requires a Suspense boundary for. */}
      <Suspense fallback={null}>
        <TestPlayer
          projectId={projectId}
          cycleKey={cycleKey}
          data={data}
          currentUserId={user.id}
          currentUserName={user.name ?? user.email}
          defaultJiraProjectKey={project?.keyPrefix ?? null}
          caseProjectId={caseSourceProjectId(projectId)}
          initialGroupBy={viewGroupBy || null}
          initialAssignedToMe={viewAssigned === "1"}
        />
      </Suspense>
    </div>
  );
}
