import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ImportModal } from "./import-modal";
import { ProjectWorkspace } from "./project-workspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
  });
  if (!project) notFound();

  const [suites, cases] = await Promise.all([
    prisma.testSuite.findMany({
      where: { projectId },
      select: { id: true, name: true, parentSuiteId: true },
    }),
    // Archived cases are hidden from the workspace.
    prisma.testCase.findMany({
      where: { suite: { projectId }, archived: false },
      select: {
        id: true,
        title: true,
        sourceKey: true,
        priority: true,
        type: true,
        status: true,
        suiteId: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="animate-fade space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/projects"
            className="text-sm text-subtle transition-colors hover:text-fg"
          >
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-fg">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-muted">{project.description}</p>
          )}
        </div>
        <ImportModal projectId={projectId} />
      </div>

      <ProjectWorkspace projectId={projectId} suites={suites} cases={cases} />
    </div>
  );
}
