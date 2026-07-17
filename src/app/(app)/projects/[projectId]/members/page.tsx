import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, getProjectRole } from "@/lib/auth";
import { ProjectTabs } from "../project-tabs";
import { MembersPanel } from "./members-panel";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();

  // Role check runs inside the parallel batch; its result gates rendering.
  const [myRole, project, members] = await Promise.all([
    getProjectRole(projectId, user),
    prisma.project.findFirst({
      where: { id: projectId },
      select: { id: true, name: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);
  if (!myRole || !project) notFound();

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

      <MembersPanel
        projectId={projectId}
        canManage={myRole === "admin"}
        currentUserId={user.id}
        members={members.map((m) => ({
          id: m.id,
          role: m.role,
          joined: m.createdAt.toISOString(),
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
        }))}
      />
    </div>
  );
}
