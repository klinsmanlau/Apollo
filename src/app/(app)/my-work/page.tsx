import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PriorityFlag } from "@/components/ui";
import { execMeta } from "@/lib/exec-status";
import type { ExecutionStatus } from "@prisma/client";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function MyWorkPage() {
  const user = await requireUser();

  const membership = { run: { project: { members: { some: { userId: user.id } } } } };

  const [assigned, statusCounts, recent30dCount, recent] = await Promise.all([
    prisma.testExecution.findMany({
      where: { assignedToId: user.id, ...membership },
      select: {
        id: true,
        status: true,
        case: { select: { key: true, title: true, priority: true } },
        run: { select: { id: true, key: true, name: true, project: { select: { id: true, name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.testExecution.groupBy({
      by: ["status"],
      where: { executedById: user.id, executedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.testExecution.count({
      where: {
        executedById: user.id,
        executedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.testExecution.findMany({
      where: { executedById: user.id, executedAt: { not: null } },
      select: {
        id: true,
        status: true,
        executedAt: true,
        case: { select: { key: true, title: true } },
        run: { select: { id: true, key: true, name: true, project: { select: { id: true, name: true } } } },
      },
      orderBy: { executedAt: "desc" },
      take: 10,
    }),
  ]);

  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]));
  const totalExecuted = statusCounts.reduce((sum, s) => sum + s._count._all, 0);

  return (
    <div className="animate-fade space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg">My Work</h1>
        <p className="mt-1 text-sm text-muted">
          What&apos;s assigned to you, and what you&apos;ve executed, across every project.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card p-4">
          <p className="text-2xl font-bold text-fg">{assigned.length}</p>
          <p className="text-xs text-muted">Assigned to you</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-fg">{totalExecuted}</p>
          <p className="text-xs text-muted">Executed (all time)</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-fg">{recent30dCount}</p>
          <p className="text-xs text-muted">Executed (last 30 days)</p>
        </div>
        {(["pass", "fail", "blocked"] as ExecutionStatus[]).map((s) => (
          <div key={s} className="card p-4">
            <p className="text-2xl font-bold text-fg">{countByStatus.get(s) ?? 0}</p>
            <p className="text-xs text-muted">{execMeta(s).label}</p>
          </div>
        ))}
      </div>

      {/* Assigned to me */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-fg">
          Assigned to me <span className="text-subtle">{assigned.length}</span>
        </h2>
        {assigned.length === 0 ? (
          <p className="text-sm text-muted">Nothing assigned to you right now.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Project / Cycle</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {assigned.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-muted">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <PriorityFlag priority={e.case.priority} />
                        <span className="shrink-0 font-mono text-xs text-ring">{e.case.key ?? "—"}</span>
                        <span className="truncate text-fg">{e.case.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {e.run.project.name} · {e.run.name}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${execMeta(e.status).pill}`}>
                        {execMeta(e.status).label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/projects/${e.run.project.id}/cycles/${e.run.key ?? e.run.id}/play?exec=${e.id}`}
                        className="text-xs font-medium text-ring hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recently executed */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-fg">Recently executed by me</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No executions recorded yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Project / Cycle</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Executed</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-muted">
                    <td className="px-3 py-2">
                      <span className="shrink-0 font-mono text-xs text-ring">{e.case.key ?? "—"}</span>{" "}
                      <span className="text-fg">{e.case.title}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {e.run.project.name} · {e.run.name}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${execMeta(e.status).pill}`}>
                        {execMeta(e.status).label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{fmtDate(e.executedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/projects/${e.run.project.id}/cycles/${e.run.key ?? e.run.id}/play?exec=${e.id}`}
                        className="text-xs font-medium text-ring hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
