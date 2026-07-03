import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildSuiteTree, flattenForSelect, type SuiteNode } from "@/lib/suites";
import { PriorityBadge, TypeBadge } from "@/components/ui";
import { NewSuiteForm } from "./new-suite-form";
import { NewCaseModal } from "./new-case-modal";
import { ImportModal } from "./import-modal";
import { deleteSuite } from "@/lib/actions/suites";

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
    prisma.testSuite.findMany({ where: { projectId } }),
    prisma.testCase.findMany({
      where: { suite: { projectId } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const tree = buildSuiteTree(suites);
  const suiteOptions = flattenForSelect(tree);

  // Group cases by suite for quick lookup.
  const casesBySuite = new Map<string, typeof cases>();
  for (const c of cases) {
    const arr = casesBySuite.get(c.suiteId) ?? [];
    arr.push(c);
    casesBySuite.set(c.suiteId, arr);
  }

  function renderNode(node: SuiteNode, depth = 0) {
    const suiteCases = casesBySuite.get(node.id) ?? [];
    return (
      <li key={node.id}>
        <div
          className="group flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <span className="text-sm font-medium text-fg">
            📁 {node.name}
            <span className="ml-2 text-xs text-subtle">
              {suiteCases.length}
            </span>
          </span>
          <form action={deleteSuite}>
            <input type="hidden" name="id" value={node.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <button
              className="text-xs text-subtle opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              title="Delete suite (and its cases)"
            >
              delete
            </button>
          </form>
        </div>
        {suiteCases.length > 0 && (
          <ul>
            {suiteCases.map((c) => (
              <li
                key={c.id}
                style={{ paddingLeft: `${depth * 16 + 28}px` }}
                className="py-1"
              >
                <Link
                  href={`/projects/${projectId}/cases/${c.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-fg"
                >
                  <span className="truncate">📝 {c.title}</span>
                  <PriorityBadge priority={c.priority} />
                  <TypeBadge type={c.type} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {node.children.length > 0 && (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <div className="animate-fade space-y-6">
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
        <div className="flex items-center gap-2">
          <ImportModal projectId={projectId} />
          {suiteOptions.length > 0 && (
            <NewCaseModal projectId={projectId} suiteOptions={suiteOptions} />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">
            Suites & cases
          </h2>
          {tree.length === 0 ? (
            <p className="text-sm text-muted">
              No suites yet. Create one to start adding test cases.
            </p>
          ) : (
            <ul>{tree.map((n) => renderNode(n))}</ul>
          )}
        </section>

        <aside>
          <NewSuiteForm projectId={projectId} suiteOptions={suiteOptions} />
        </aside>
      </div>
    </div>
  );
}
