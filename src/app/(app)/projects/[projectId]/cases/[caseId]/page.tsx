import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PriorityBadge, TypeBadge, Tag } from "@/components/ui";
import { deleteCase } from "@/lib/actions/cases";
import type { Step } from "@/lib/validation";

export default async function CasePage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  const user = await requireUser();

  const testCase = await prisma.testCase.findFirst({
    where: {
      id: caseId,
      suite: { projectId, project: { members: { some: { userId: user.id } } } },
    },
    include: { suite: true, createdBy: true },
  });
  if (!testCase) notFound();

  const steps = (testCase.steps as unknown as Step[]) ?? [];

  return (
    <div className="animate-fade mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-subtle transition-colors hover:text-fg"
          >
            ← {testCase.suite.name}
          </Link>
          {testCase.sourceKey && (
            <p className="mt-1 font-mono text-xs text-subtle">
              {testCase.sourceKey}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold text-fg">{testCase.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted">
              {testCase.status}
            </span>
            <PriorityBadge priority={testCase.priority} />
            <TypeBadge type={testCase.type} />
            {testCase.component && (
              <span className="text-xs text-muted">
                component: {testCase.component}
              </span>
            )}
            {testCase.externalRef && (
              <span className="text-xs text-muted">
                ref: {testCase.externalRef}
              </span>
            )}
            {testCase.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
          {testCase.coverage.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Coverage: {testCase.coverage.join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/cases/${caseId}/edit`}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
          >
            Edit
          </Link>
          <form action={deleteCase}>
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="projectId" value={projectId} />
            <button className="rounded-md border border-red-200 bg-surface px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
              Delete
            </button>
          </form>
        </div>
      </div>

      {testCase.objective && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-muted">Objective</h2>
          <p className="whitespace-pre-wrap text-sm text-fg">
            {testCase.objective}
          </p>
        </section>
      )}

      {testCase.preconditions && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-muted">
            Preconditions
          </h2>
          <p className="whitespace-pre-wrap text-sm text-fg">
            {testCase.preconditions}
          </p>
        </section>
      )}

      {testCase.scriptType === "steps" ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Steps</h2>
          {steps.length === 0 ? (
            <p className="text-sm text-subtle">No steps defined.</p>
          ) : (
            <ol className="overflow-hidden rounded-lg border border-line">
              <li className="grid grid-cols-[auto_1fr_1fr_1fr] gap-3 bg-surface-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <span className="w-5">#</span>
                <span>Action</span>
                <span>Test data</span>
                <span>Expected</span>
              </li>
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[auto_1fr_1fr_1fr] gap-3 border-t border-line bg-surface px-3 py-2 text-sm text-fg"
                >
                  <span className="w-5 text-subtle">{i + 1}</span>
                  <span className="whitespace-pre-wrap">{s.action}</span>
                  <span className="whitespace-pre-wrap text-muted">
                    {s.testData}
                  </span>
                  <span className="whitespace-pre-wrap text-muted">
                    {s.expected}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {testCase.scriptType === "bdd" ? "BDD script" : "Script"}
          </h2>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface-muted p-3 text-sm text-fg">
            {testCase.scriptBody}
          </pre>
        </section>
      )}

      {testCase.expectedResult && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-muted">
            Overall expected result
          </h2>
          <p className="whitespace-pre-wrap text-sm text-fg">
            {testCase.expectedResult}
          </p>
        </section>
      )}

      <p className="text-xs text-subtle">
        Created by {testCase.createdBy?.name ?? testCase.createdBy?.email ?? "—"}{" "}
        · updated {testCase.updatedAt.toLocaleString()}
      </p>
    </div>
  );
}
