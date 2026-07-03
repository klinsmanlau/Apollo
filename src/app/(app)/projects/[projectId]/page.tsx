import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildSuiteTree, flattenForSelect, type SuiteNode } from "@/lib/suites";
import { PriorityBadge, TypeBadge } from "@/components/ui";
import { NewSuiteForm } from "./new-suite-form";
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
          className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-gray-50"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <span className="text-sm font-medium text-gray-800">
            📁 {node.name}
            <span className="ml-2 text-xs text-gray-400">
              {suiteCases.length}
            </span>
          </span>
          <form action={deleteSuite}>
            <input type="hidden" name="id" value={node.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <button
              className="text-xs text-gray-400 hover:text-red-600"
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
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/projects"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-gray-500">{project.description}</p>
          )}
        </div>
        {suiteOptions.length > 0 && (
          <Link
            href={`/projects/${projectId}/cases/new`}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            + New test case
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Suites & cases
          </h2>
          {tree.length === 0 ? (
            <p className="text-sm text-gray-500">
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
