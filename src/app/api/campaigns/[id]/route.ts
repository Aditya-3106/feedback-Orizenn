import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { deleteCampaign, getCampaign, setCampaignStatus, updateCampaign } from "@/lib/campaigns/service";
import { campaignInputSchema, campaignStatusSchema } from "@/lib/validation/campaign";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const actor = await requireActor("campaign:view");
  const { id } = await params;
  const campaign = await getCampaign(actor, id);
  return jsonOk(campaign);
});

const patchSchema = z.union([
  z.object({ status: campaignStatusSchema }),
  campaignInputSchema,
]);

export const PATCH = withApi(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor("campaign:edit");
  const { id } = await params;
  const body = parseOrThrow(patchSchema, await readJson(req));
  if ("status" in body && Object.keys(body).length === 1) {
    return jsonOk(await setCampaignStatus(actor, id, body.status));
  }
  return jsonOk(await updateCampaign(actor, id, body as z.infer<typeof campaignInputSchema>));
});

export const DELETE = withApi(async (_req: Request, { params }: Ctx) => {
  const actor = await requireActor("campaign:delete");
  const { id } = await params;
  await deleteCampaign(actor, id);
  return jsonOk(null);
});
