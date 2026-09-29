import { jsonOk, withApi } from "@/lib/api/response";
import { loadDashboard } from "@/lib/analytics/load";
import { requireActor } from "@/lib/auth/session";
import { filtersFromSearchParams } from "@/lib/validation/filters";

/** GET /api/campaigns/:id/analytics?college=…&year=… — deterministic dashboard payload. */
export const GET = withApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("analytics:view");
  const { id } = await params;
  const filters = filtersFromSearchParams(new URL(req.url).searchParams);
  const dashboard = await loadDashboard(actor, id, filters);
  return jsonOk(dashboard, { headers: { "Cache-Control": "no-store" } });
});
