import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { Step } from "@/lib/validation";
import { TestPlayer, type PlayerData } from "./test-player";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ projectId: string; cycleKey: string }>;
}) {
  const { projectId, cycleKey } = await params;
  const user = await requireUser();

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
    executions: cycle.executions.map((e) => ({
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
      caseTitle: e.case.title,
      casePriority: e.case.priority,
      caseComponent: e.case.component,
      caseFolder: e.case.suite?.name ?? null,
      caseObjective: e.case.objective,
      casePreconditions: e.case.preconditions,
      caseSteps: (e.case.steps as unknown as Step[]) ?? [],
      caseEstimatedTime: e.case.estimatedTime,
      attachments: e.attachmentFiles,
    })),
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
        />
      </Suspense>
    </div>
  );
}
