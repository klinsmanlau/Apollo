import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildSuiteTree, flattenForSelect } from "@/lib/suites";
import { createCase } from "@/lib/actions/cases";
import { CaseForm } from "../case-form";

export default async function NewCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ suiteId?: string }>;
}) {
  const { projectId } = await params;
  const { suiteId } = await searchParams;
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
  });
  if (!project) notFound();

  const suites = await prisma.testSuite.findMany({ where: { projectId } });
  const suiteOptions = flattenForSelect(buildSuiteTree(suites));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">New test case</h1>
      </div>
      <CaseForm
        action={createCase}
        projectId={projectId}
        suiteOptions={suiteOptions}
        initial={{ suiteId: suiteId ?? "" }}
        submitLabel="Create test case"
      />
    </div>
  );
}
