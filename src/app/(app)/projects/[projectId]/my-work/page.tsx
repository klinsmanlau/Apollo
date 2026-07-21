import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, getProjectRole } from "@/lib/auth";
import { PriorityFlag, StatusBadge } from "@/components/ui";
import { ProjectTabs } from "../project-tabs";
import { ArrowLeft, Play } from "@/components/icons";

export default async function MyWorkPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();

  // Role check runs inside the parallel batch; its result gates rendering.
  const [myRole, project, executions] = await Promise.all([
    getProjectRole(projectId, user),
    prisma.project.findFirst({
      where: { id: projectId },
      select: { id: true, name: true },
    }),
    prisma.testExecution.findMany({
      where: {
        run: { projectId },
        status: { in: ["not_executed", "in_progress"] },
        // FK match, plus legacy rows assigned by name before the FK existed.
        OR: [
          { assignedToId: user.id },
          {
            assignedToId: null,
            assignedToName: { in: [user.name, user.email].filter((s): s is string => !!s) },
          },
        ],
      },
      orderBy: [{ run: { keyNum: "desc" } }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        environment: true,
        case: { select: { id: true, key: true, title: true, priority: true } },
        run: { select: { id: true, key: true, name: true } },
      },
    }),
  ]);
  if (!myRole || !project) notFound();

  // Group by cycle, preserving the query's cycle order.
  const byCycle = new Map<string, { run: (typeof executions)[number]["run"]; items: typeof executions }>();
  for (const e of executions) {
    const g = byCycle.get(e.run.id) ?? { run: e.run, items: [] };
    g.items.push(e);
    byCycle.set(e.run.id, g);
  }

  return (
    <div className="animate-fade flex h-full flex-col gap-4">
      <div className="shrink-0">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft size={14} /> Projects
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-fg">{project.name}</h1>
      </div>

      <ProjectTabs projectId={projectId} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="mx-auto w-full max-w-4xl">
          <p className="mb-4 text-sm text-muted">
            {executions.length === 0
              ? "You have no open executions assigned in this project."
              : `${executions.length} open execution${executions.length === 1 ? "" : "s"} assigned to you.`}
          </p>

          <div className="space-y-4">
            {[...byCycle.values()].map(({ run, items }) => (
              <div key={run.id} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <Link
                    href={`/projects/${projectId}/cycles/${run.key ?? run.id}`}
                    className="min-w-0 truncate text-sm font-semibold text-fg hover:text-ring"
                  >
                    {run.key && (
                      <span className="mr-1.5 font-mono text-xs text-subtle">{run.key}</span>
                    )}
                    {run.name}
                  </Link>
                  <Link
                    href={`/projects/${projectId}/cycles/${run.key ?? run.id}/play`}
                    className="btn btn-sm btn-accent shrink-0"
                  >
                    <Play size={12} /> Play
                  </Link>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((e) => (
                      <tr key={e.id} className="border-t border-line/50 first:border-0">
                        <td className="w-8 px-3 py-2">
                          <PriorityFlag priority={e.case.priority} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <Link
                            href={`/projects/${projectId}/cases/${e.case.key ?? e.case.id}`}
                            className="font-mono text-xs text-ring hover:underline"
                          >
                            {e.case.key ?? "—"}
                          </Link>
                        </td>
                        <td className="max-w-[24rem] px-2 py-2">
                          <span className="block truncate text-fg" title={e.case.title}>
                            {e.case.title}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted">
                          {e.environment ?? ""}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <StatusBadge status={e.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
