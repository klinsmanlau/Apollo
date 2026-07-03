import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { NewProjectForm } from "./new-project-form";

export default async function ProjectsPage() {
  const user = await requireUser();

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { suites: true, runs: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      <NewProjectForm />

      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">
          No projects yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
              >
                <h2 className="font-semibold">{p.name}</h2>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                    {p.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-gray-400">
                  {p._count.suites} suites · {p._count.runs} runs
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
