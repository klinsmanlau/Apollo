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
    <div className="animate-fade mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}/cases/${caseId}`}
          className="text-sm text-subtle transition-colors hover:text-fg"
        >
          ← Back to case
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-fg">Edit test case</h1>
      </div>
      <CaseForm
        action={updateCase}
        projectId={projectId}
        caseId={caseId}
        suiteOptions={suiteOptions}
        initial={{
          suiteId: testCase.suiteId,
          title: testCase.title,
          objective: testCase.objective ?? "",
          preconditions: testCase.preconditions ?? "",
          scriptType: testCase.scriptType,
          steps: (testCase.steps as unknown as Step[]) ?? [],
          scriptBody: testCase.scriptBody ?? "",
          expectedResult: testCase.expectedResult ?? "",
          priority: testCase.priority,
          type: testCase.type,
          status: testCase.status,
          component: testCase.component ?? "",
          ownerName: testCase.ownerName ?? "",
          estimatedTime:
            testCase.estimatedTime != null ? String(testCase.estimatedTime) : "",
          tags: testCase.tags,
          coverage: testCase.coverage,
          externalRef: testCase.externalRef ?? "",
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
