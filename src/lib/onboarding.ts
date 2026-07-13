import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

// Role granted to a newly-provisioned account when auto-joining projects.
const DEFAULT_JOIN_ROLE: Role = "lead";

/**
 * Ensure a user is a member of every project (internal-team model: everyone
 * belongs to all projects). Idempotent — only inserts the memberships that are
 * missing, so it's safe to call on every sign-in / user.created event.
 *
 * Returns how many memberships were newly created.
 */
export async function ensureMemberOfAllProjects(
  userId: string,
  role: Role = DEFAULT_JOIN_ROLE
): Promise<number> {
  const [projects, existing] = await Promise.all([
    prisma.project.findMany({ select: { id: true } }),
    prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    }),
  ]);

  const already = new Set(existing.map((m) => m.projectId));
  const toAdd = projects.filter((p) => !already.has(p.id));
  if (toAdd.length === 0) return 0;

  const res = await prisma.projectMember.createMany({
    data: toAdd.map((p) => ({ projectId: p.id, userId, role })),
    skipDuplicates: true,
  });
  return res.count;
}
