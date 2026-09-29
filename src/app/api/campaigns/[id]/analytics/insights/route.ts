import { jsonOk, withApi } from "@/lib/api/response";
import { generateInsights } from "@/lib/ai/service";
import { requireActor } from "@/lib/auth/session";
import { filtersFromSearchParams } from "@/lib/validation/filters";

/** POST /api/campaigns/:id/analytics/insights — run AI insight generation for the current filters. */
export const POST = withApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("ai:use");
  const { id } = await params;
  const filters = filtersFromSearchParams(new URL(req.url).searchParams);
  const { insight, jobId } = await generateInsights(actor, id, filters);
  return jsonOk({ insight, jobId });
});
