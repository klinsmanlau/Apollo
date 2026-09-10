import { requireProjectRole } from "@/lib/auth";
import { addAttachment } from "@/lib/jira";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (Jira Cloud's own default cap)

/**
 * Push freshly-picked local files straight to a Jira issue's attachments —
 * bytes never touch Apollo's own storage, this is a pass-through. (Re-sending
 * an execution's *existing* Apollo evidence to Jira instead goes through
 * `createJiraIssueForExecution`, which already has those bytes in Storage.)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; issueKey: string }> }
) {
  const { projectId, issueKey } = await params;
  try {
    await requireProjectRole(projectId, "tester");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (files.length === 0) {
    return Response.json({ error: "No files provided" }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return Response.json({ error: `"${f.name}" is over the 10 MB limit` }, { status: 400 });
    }
  }

  let failed = 0;
  for (const f of files) {
    try {
      await addAttachment(issueKey, {
        fileName: f.name || "attachment",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      });
    } catch {
      failed++;
    }
  }

  if (failed === files.length) {
    return Response.json({ error: "Could not upload any file to Jira" }, { status: 502 });
  }
  return Response.json({ ok: true, uploaded: files.length - failed, failed });
}
