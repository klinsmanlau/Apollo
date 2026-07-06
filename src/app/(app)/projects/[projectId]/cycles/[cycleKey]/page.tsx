import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CycleDetail, type CycleData } from "./cycle-detail";

export default async function CycleRunPage({
  params,
}: {
  params: Promise<{ projectId: string; cycleKey: string }>;
}) {
  const { projectId, cycleKey } = await params;
  const user = await requireUser();

  const [cycle, folders, members] = await Promise.all([
    prisma.testRun.findFirst({
      where: {
        project: { id: projectId, members: { some: { userId: user.id } } },
        OR: [{ key: cycleKey }, { id: cycleKey }],
      },
      include: {
        executions: {
          include: {
            case: { select: { id: true, key: true, title: true, priority: true } },
            executedBy: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.cycleFolder.findMany({
      where: { projectId },
      select: { id: true, name: true, parentFolderId: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  if (!cycle) notFound();

  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (id: string | null): string => {
    const parts: string[] = [];
    let cur = id ? byId.get(id) : undefined;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined;
    }
    return parts.join(" / ");
  };

  const folderOptions = [
    { value: "", label: "— Top level —" },
    ...folders
      .map((f) => ({ value: f.id, label: "/" + pathOf(f.id).replace(/ \/ /g, "/") }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const rawCustom = (cycle.customFields ?? {}) as Record<string, unknown>;
  const customFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawCustom)) customFields[k] = String(v ?? "");

  const data: CycleData = {
    id: cycle.id,
    key: cycle.key,
    name: cycle.name,
    description: cycle.description,
    status: cycle.status,
    version: cycle.version,
    iteration: cycle.iteration,
    ownerName: cycle.ownerName,
    startDate: cycle.startDate ? cycle.startDate.toISOString().slice(0, 10) : "",
    endDate: cycle.endDate ? cycle.endDate.toISOString().slice(0, 10) : "",
    folderId: cycle.folderId,
    folderPath: pathOf(cycle.folderId),
    customFields,
    folderOptions,
    users: members.map((m) => m.user),
    executions: cycle.executions.map((e) => ({
      id: e.id,
      status: e.status,
      notes: e.notes,
      caseId: e.case.id,
      caseKey: e.case.key,
      caseTitle: e.case.title,
      casePriority: e.case.priority,
      executedByName: e.executedBy?.name ?? e.executedBy?.email ?? null,
      executedAt: e.executedAt?.toISOString() ?? null,
    })),
  };

  return (
    <div className="animate-fade h-full">
      <CycleDetail projectId={projectId} initial={data} />
    </div>
  );
}
