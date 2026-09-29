import { jsonOk, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { listSubmissions } from "@/lib/submissions/service";
import { filtersFromSearchParams } from "@/lib/validation/filters";

export const GET = withApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("responses:view");
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const result = await listSubmissions(actor, id, {
    filters: filtersFromSearchParams(sp),
    q: sp.get("q") ?? undefined,
    page: Number(sp.get("page") ?? 1) || 1,
    pageSize: Number(sp.get("pageSize") ?? 25) || 25,
  });
  return jsonOk(result, { headers: { "Cache-Control": "no-store" } });
});
