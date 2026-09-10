import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Read-only lookup for the Jira "Apollo Test Results" issue panel (a
 * separate Forge app — see /jira-panel-app) — given a Jira issue key, returns
 * every Apollo execution linked to it. Server-to-server only: Forge's
 * resolver calls this with a shared secret, there's no browser session.
 */
export const runtime = "nodejs";

function eq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function verify(header: string | null): boolean {
  const secret = process.env.JIRA_PANEL_SECRET;
  if (!secret || !header) return false;
  return eq(header, secret);
}

export async function GET(req: Request) {
  if (!verify(req.headers.get("x-apollo-panel-secret"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const issueKey = new URL(req.url).searchParams.get("issueKey")?.trim().toUpperCase();
  if (!issueKey) return new Response("Missing issueKey", { status: 400 });

  const links = await prisma.linkedIssue.findMany({
    where: { issueKey },
    select: {
      id: true,
      execution: {
        select: {
          id: true,
          status: true,
          case: { select: { key: true, title: true } },
          run: {
            select: {
              key: true,
              name: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const executions = links.map((l) => ({
    id: l.execution.id,
    caseKey: l.execution.case.key,
    caseTitle: l.execution.case.title,
    status: l.execution.status,
    cycleName: l.execution.run.name,
    projectName: l.execution.run.project.name,
    url: `${baseUrl}/projects/${l.execution.run.project.id}/cycles/${l.execution.run.key}/play`,
  }));

  return Response.json({ executions });
}
