import { auth } from "@clerk/nextjs/server";
import {
  queryCasePage,
  type SortField,
  type SortDir,
} from "@/lib/cases-query";

const SORT_FIELDS = new Set(["key", "title", "priority", "status"]);

// On-demand, paginated case fetch for the workspace table. Membership is
// enforced inside the query (via clerk id), and the client passes the folder's
// subtree ids — so this is a single DB round-trip (findMany + count).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const archived = url.searchParams.get("archived") === "1";
  const suiteIdsParam = url.searchParams.get("suiteIds");
  const suiteIds =
    suiteIdsParam && !archived
      ? suiteIdsParam.split(",").filter(Boolean)
      : undefined;
  const q = url.searchParams.get("q") ?? "";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? "0") || 0);
  const sortParam = url.searchParams.get("sort");
  const sort =
    sortParam && SORT_FIELDS.has(sortParam) ? (sortParam as SortField) : undefined;
  const dir: SortDir = url.searchParams.get("dir") === "desc" ? "desc" : "asc";

  const { cases, total } = await queryCasePage(
    projectId,
    { suiteIds, archived },
    q,
    page,
    sort,
    dir,
    { memberClerkId: userId }
  );
  return Response.json({ cases, total });
}
