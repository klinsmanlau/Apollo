import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildSuiteTree, flattenForSelect } from "@/lib/suites";
import type { Step } from "@/lib/validation";
import { CaseDetail, type CaseData } from "./case-detail";

export default async function CasePage({
  params,
}: {
  params: Promise<{ projectId: string; caseId: string }>;
}) {
  const { projectId, caseId } = await params;
  const user = await requireUser();

  // Route segment carries the case key (e.g. TS-T7060); fall back to id.
  const [testCase, suites, members] = await Promise.all([
    prisma.testCase.findFirst({
      where: {
        suite: { projectId, project: { members: { some: { userId: user.id } } } },
        OR: [{ key: caseId }, { id: caseId }],
      },
      include: { createdBy: true },
    }),
    prisma.testSuite.findMany({ where: { projectId } }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  if (!testCase) notFound();

  const suiteOptions = flattenForSelect(buildSuiteTree(suites)).map((o) => ({
    value: o.id,
    label: o.label,
  }));
  const users = members.map((m) => m.user);

  // Folder breadcrumb path.
  const byId = new Map(suites.map((s) => [s.id, s]));
  const parts: string[] = [];
  let cur = byId.get(testCase.suiteId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentSuiteId ? byId.get(cur.parentSuiteId) : undefined;
  }

  const rawCustom = (testCase.customFields ?? {}) as Record<string, unknown>;
  const customFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawCustom)) customFields[k] = String(v ?? "");

  const data: CaseData = {
    id: testCase.id,
    key: testCase.key,
    title: testCase.title,
    objective: testCase.objective,
    preconditions: testCase.preconditions,
    scriptType: testCase.scriptType,
    steps: (testCase.steps as unknown as Step[]) ?? [],
    scriptBody: testCase.scriptBody,
    priority: testCase.priority,
    status: testCase.status,
    component: testCase.component,
    ownerName: testCase.ownerName,
    estimatedTime: testCase.estimatedTime,
    tags: testCase.tags,
    coverage: testCase.coverage,
    externalRef: testCase.externalRef,
    customFields,
    suiteId: testCase.suiteId,
    createdByName: testCase.createdBy?.name ?? testCase.createdBy?.email ?? null,
    updatedAt: testCase.updatedAt.toISOString(),
  };

  return (
    <div className="animate-fade h-full">
      <CaseDetail
        projectId={projectId}
        initial={data}
        suiteOptions={suiteOptions}
        folderPath={parts.join(" / ")}
        users={users}
      />
    </div>
  );
}
