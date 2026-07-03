import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildSuiteTree, flattenForSelect } from "@/lib/suites";
import { updateCase } from "@/lib/actions/cases";
import type { Step } from "@/lib/validation";
import { CaseForm } from "../../case-form";

export default async function EditCasePage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  const user = await requireUser();

  const [testCase, suites] = await Promise.all([
    prisma.testCase.findFirst({
      where: {
        id: caseId,
        suite: {
          projectId,
          project: { members: { some: { userId: user.id } } },
        },
      },
    }),
    prisma.testSuite.findMany({ where: { projectId } }),
  ]);
  if (!testCase) notFound();

  const suiteOptions = flattenForSelect(buildSuiteTree(suites));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}/cases/${caseId}`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back to case
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Edit test case</h1>
      </div>
      <CaseForm
        action={updateCase}
        projectId={projectId}
        caseId={caseId}
        suiteOptions={suiteOptions}
        initial={{
          suiteId: testCase.suiteId,
          title: testCase.title,
          preconditions: testCase.preconditions ?? "",
          steps: (testCase.steps as unknown as Step[]) ?? [],
          expectedResult: testCase.expectedResult ?? "",
          priority: testCase.priority,
          type: testCase.type,
          tags: testCase.tags,
          externalRef: testCase.externalRef ?? "",
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
