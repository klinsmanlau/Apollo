import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { queryCasePage, suiteCaseCounts } from "@/lib/cases-query";
import { ImportModal } from "./import-modal";
import { ProjectWorkspace } from "./project-workspace";
import { ProjectTabs } from "./project-tabs";

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

  // Everything the page needs runs in one parallel batch (each DB round-trip
  // to the pooler is the cost driver, so we avoid sequential awaits). Case
  // rows load on demand afterwards; here we only prefetch the first "all" page.
  const [project, suites, directCounts, archivedCount, initialAll] =
    await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, members: { some: { userId: user.id } } },
      }),
      prisma.testSuite.findMany({
        where: { projectId },
        select: { id: true, name: true, parentSuiteId: true },
      }),
      suiteCaseCounts(projectId),
      prisma.testCase.count({ where: { suite: { projectId }, archived: true } }),
      folder ? null : queryCasePage(projectId, {}, "", 0),
    ]);
  if (!project) notFound();

  // Deep-linked to a folder → fetch that folder's first page (rare path).
  const validFolder =
    folder && suites.some((s) => s.id === folder) ? folder : null;
  const initial = validFolder
    ? await queryCasePage(projectId, { suiteId: validFolder }, "", 0)
    : initialAll ?? (await queryCasePage(projectId, {}, "", 0));

  return (
    <div className="animate-fade flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between">
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

      <ProjectTabs projectId={projectId} />

      <ProjectWorkspace
        projectId={projectId}
        suites={suites}
        directCounts={directCounts}
        archivedCount={archivedCount}
        initialCases={initial.cases}
        initialTotal={initial.total}
        initialFolder={validFolder}
      />
    </div>
  );
}
