import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ImportModal } from "./import-modal";
import { ProjectWorkspace } from "./project-workspace";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { projectId } = await params;
  const { folder } = await searchParams;
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
  });
  if (!project) notFound();

  const caseSelect = {
    id: true,
    title: true,
    sourceKey: true,
    priority: true,
    type: true,
    status: true,
    suiteId: true,
  } as const;

  const [suites, cases, archivedCases] = await Promise.all([
    prisma.testSuite.findMany({
      where: { projectId },
      select: { id: true, name: true, parentSuiteId: true },
    }),
    // Active cases power the folder tree; archived are shown in their own view.
    prisma.testCase.findMany({
      where: { suite: { projectId }, archived: false },
      select: caseSelect,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.testCase.findMany({
      where: { suite: { projectId }, archived: true },
      select: caseSelect,
      orderBy: { archivedAt: "desc" },
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

      <ProjectWorkspace
        projectId={projectId}
        suites={suites}
        cases={cases}
        archivedCases={archivedCases}
        initialFolder={folder ?? null}
      />
    </div>
  );
}
