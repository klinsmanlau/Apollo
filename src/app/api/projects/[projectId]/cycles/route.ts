import { auth } from "@clerk/nextjs/server";
import {
  queryCyclePage,
  type CycleSort,
  type SortDir,
} from "@/lib/cycles-query";

const SORT_FIELDS = new Set(["key", "name"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const folderIdsParam = url.searchParams.get("folderIds");
  const folderIds = folderIdsParam
    ? folderIdsParam.split(",").filter(Boolean)
    : undefined;
  const q = url.searchParams.get("q") ?? "";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? "0") || 0);
  const sortParam = url.searchParams.get("sort");
  const sort =
    sortParam && SORT_FIELDS.has(sortParam) ? (sortParam as CycleSort) : undefined;
  const dir: SortDir = url.searchParams.get("dir") === "desc" ? "desc" : "asc";

  const { cycles, total } = await queryCyclePage(
    projectId,
    { folderIds },
    q,
    page,
    sort,
    dir,
    userId
  );
  return Response.json({ cycles, total });
}
