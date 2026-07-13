import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, getProjectRole, roleAtLeast } from "@/lib/auth";
import {
  queryCyclePage,
  cycleFolderCounts,
  getCycleSubtreeIds,
} from "@/lib/cycles-query";
import { ProjectTabs } from "../project-tabs";
import { CycleWorkspace } from "./cycle-workspace";

export default async function CyclesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { projectId } = await params;
  const { folder } = await searchParams;
  const user = await requireUser();
  const myRole = await getProjectRole(projectId, user);
  if (!myRole) notFound();

  const [project, folders, members] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId },
      select: { id: true, name: true },
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
  if (!project) notFound();
  const users = members.map((m) => m.user);

  const validFolder =
    folder && folders.some((f) => f.id === folder) ? folder : null;
  const [directCounts, initial] = await Promise.all([
    cycleFolderCounts(projectId),
    queryCyclePage(
      projectId,
      validFolder
        ? { folderIds: await getCycleSubtreeIds(projectId, validFolder) }
        : {},
      "",
      0
    ),
  ]);

  return (
    <div className="animate-fade flex h-full flex-col gap-4">
      <div className="shrink-0">
        <Link
          href="/projects"
          className="text-sm text-subtle transition-colors hover:text-fg"
        >
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-fg">{project.name}</h1>
      </div>

      <ProjectTabs projectId={projectId} />

      <CycleWorkspace
        projectId={projectId}
        folders={folders}
        directCounts={directCounts}
        initialCycles={initial.cycles}
        initialTotal={initial.total}
        initialFolder={validFolder}
        users={users}
        canEdit={roleAtLeast(myRole, "lead")}
        canDelete={roleAtLeast(myRole, "admin")}
      />
    </div>
  );
}
