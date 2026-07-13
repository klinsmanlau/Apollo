import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { NewProjectForm } from "./new-project-form";

export default async function ProjectsPage() {
  const user = await requireUser();

  const projects = await prisma.project.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="animate-fade space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Projects</h1>
      </div>

      <NewProjectForm />

      {projects.length === 0 ? (
        <p className="text-sm text-muted">
          No projects yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <li
              key={p.id}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <Link
                href={`/projects/${p.id}`}
                className="themed flex h-[104px] flex-col justify-center rounded-xl border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/40 hover:shadow-lg hover:shadow-black/5"
              >
                <h2 className="font-semibold text-fg">{p.name}</h2>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {p.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
