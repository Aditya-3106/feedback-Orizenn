import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { generateInsights } from "@/lib/ai/service";
import { requireActor } from "@/lib/auth/session";
import { analyticsFiltersSchema } from "@/lib/validation/filters";
import { z } from "zod";

const bodySchema = z.object({
  campaignId: z.string().min(1),
  filters: analyticsFiltersSchema.default({}),
});

/** POST /api/ai/insights — generate and persist AI insights for a campaign's current dashboard. */
export const POST = withApi(async (req: Request) => {
  const actor = await requireActor("ai:use");
  const { campaignId, filters } = parseOrThrow(bodySchema, await readJson(req));
  const { insight, jobId } = await generateInsights(actor, campaignId, filters);
  return jsonOk({ insight, jobId });
});
