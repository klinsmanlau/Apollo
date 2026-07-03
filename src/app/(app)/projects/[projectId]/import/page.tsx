import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ImportForm } from "./import-form";

export default async function ImportPage({
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

  return (
    <div className="animate-fade mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-subtle transition-colors hover:text-fg"
        >
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-fg">Import from Zephyr</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a Zephyr Scale test-case export to populate this project&apos;s
          suites and cases.
        </p>
      </div>
      <div className="card p-5">
        <ImportForm projectId={projectId} />
      </div>
    </div>
  );
}
