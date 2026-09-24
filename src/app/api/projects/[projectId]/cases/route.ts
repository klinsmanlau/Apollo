import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  queryCasePage,
  CASE_PAGE_SIZE,
  type SortField,
  type SortDir,
} from "@/lib/cases-query";
import { normalizeFilters, type CaseFilter } from "@/lib/case-filters";
import { caseSourceProjectId } from "@/lib/case-source";

const SORT_FIELDS = new Set(["key", "title", "priority", "status"]);
const ALLOWED_PAGE_SIZES = new Set([40, 60, 80, 100]);

// On-demand, paginated case fetch for the workspace table. Membership is
// enforced inside the query (via the local user id), and the client passes the
// folder's subtree ids — so this is a single DB round-trip (findMany + count).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  // `source=1` reads this project's shared case library (the QA-team source
  // project a POD draws from). Authorize on the URL project — a POD member need
  // not be a member of the source project — then query the source's cases.
  const useSource = url.searchParams.get("source") === "1";
  let queryProjectId = projectId;
  let memberOpts: { memberUserId?: string } = { memberUserId: userId };
  if (useSource) {
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId, userId },
      select: { id: true },
    });
    if (!isMember) return new Response("Forbidden", { status: 403 });
    queryProjectId = caseSourceProjectId(projectId);
    // Membership already verified against the URL project; don't re-require it
    // on the (different) source project inside the query.
    memberOpts = {};
  }
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
    queryProjectId,
    { suiteIds, archived },
    q,
    page,
    sort,
    dir,
    memberOpts,
    filters,
    pageSize
  );
  return Response.json({ cases, total });
}
