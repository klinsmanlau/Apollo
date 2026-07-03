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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← {testCase.suite.name}
          </Link>
          {testCase.sourceKey && (
            <p className="mt-1 font-mono text-xs text-gray-400">
              {testCase.sourceKey}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold">{testCase.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {testCase.status}
            </span>
            <PriorityBadge priority={testCase.priority} />
            <TypeBadge type={testCase.type} />
            {testCase.component && (
              <span className="text-xs text-gray-500">
                component: {testCase.component}
              </span>
            )}
            {testCase.externalRef && (
              <span className="text-xs text-gray-500">
                ref: {testCase.externalRef}
              </span>
            )}
            {testCase.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
          {testCase.coverage.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Coverage: {testCase.coverage.join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/cases/${caseId}/edit`}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Edit
          </Link>
          <form action={deleteCase}>
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="projectId" value={projectId} />
            <button className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
              Delete
            </button>
          </form>
        </div>
      </div>

      {testCase.objective && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Objective</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {testCase.objective}
          </p>
        </section>
      )}

      {testCase.preconditions && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-gray-700">
            Preconditions
          </h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {testCase.preconditions}
          </p>
        </section>
      )}

      {testCase.scriptType === "steps" ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Steps</h2>
          {steps.length === 0 ? (
            <p className="text-sm text-gray-400">No steps defined.</p>
          ) : (
            <ol className="overflow-hidden rounded-lg border border-gray-200">
              <li className="grid grid-cols-[auto_1fr_1fr_1fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span className="w-5">#</span>
                <span>Action</span>
                <span>Test data</span>
                <span>Expected</span>
              </li>
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[auto_1fr_1fr_1fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm"
                >
                  <span className="w-5 text-gray-400">{i + 1}</span>
                  <span className="whitespace-pre-wrap">{s.action}</span>
                  <span className="whitespace-pre-wrap text-gray-600">
                    {s.testData}
                  </span>
                  <span className="whitespace-pre-wrap text-gray-600">
                    {s.expected}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            {testCase.scriptType === "bdd" ? "BDD script" : "Script"}
          </h2>
          <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            {testCase.scriptBody}
          </pre>
        </section>
      )}

      {testCase.expectedResult && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-gray-700">
            Overall expected result
          </h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {testCase.expectedResult}
          </p>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Created by {testCase.createdBy?.name ?? testCase.createdBy?.email ?? "—"}{" "}
        · updated {testCase.updatedAt.toLocaleString()}
      </p>
    </div>
  );
}
