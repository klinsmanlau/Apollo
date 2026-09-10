import { auth } from "@clerk/nextjs/server";
import {
  queryCasePage,
  CASE_PAGE_SIZE,
  type SortField,
  type SortDir,
} from "@/lib/cases-query";
import { normalizeFilters, type CaseFilter } from "@/lib/case-filters";

const SORT_FIELDS = new Set(["key", "title", "priority", "status"]);
const ALLOWED_PAGE_SIZES = new Set([40, 60, 80, 100]);

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
  const pageSizeParam = Number(url.searchParams.get("pageSize"));
  const pageSize = ALLOWED_PAGE_SIZES.has(pageSizeParam) ? pageSizeParam : CASE_PAGE_SIZE;

  // Filters arrive as a JSON array; normalize/validate against the schema.
  let filters: CaseFilter[] = [];
  const filtersParam = url.searchParams.get("filters");
  if (filtersParam) {
    try {
      filters = normalizeFilters(JSON.parse(filtersParam));
    } catch {
      filters = [];
    }
  }

  const { cases, total } = await queryCasePage(
    projectId,
    { suiteIds, archived },
    q,
    page,
    sort,
    dir,
    { memberClerkId: userId },
    filters,
    pageSize
  );
  return Response.json({ cases, total });
}
