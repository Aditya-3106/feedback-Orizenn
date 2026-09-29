import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { createCampaign, listCampaigns } from "@/lib/campaigns/service";
import { campaignInputSchema, campaignStatusSchema } from "@/lib/validation/campaign";

export const GET = withApi(async (req: Request) => {
  const actor = await requireActor("campaign:view");
  const url = new URL(req.url);
  const status = campaignStatusSchema.safeParse(url.searchParams.get("status"));
  const campaigns = await listCampaigns(actor, {
    q: url.searchParams.get("q") ?? undefined,
    status: status.success ? status.data : undefined,
    includeArchived: url.searchParams.get("includeArchived") === "true",
  });
  return jsonOk(
    campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      responseMode: c.responseMode,
      responses: c._count.submissions,
      publishedVersion: c.versions[0]?.versionNumber ?? null,
      linkSlug: c.links[0]?.slug ?? null,
      lastResponseAt: c.submissions[0]?.submittedAt ?? null,
      updatedAt: c.updatedAt,
    })),
  );
});

export const POST = withApi(async (req: Request) => {
  const actor = await requireActor("campaign:create");
  const input = parseOrThrow(campaignInputSchema, await readJson(req));
  const campaign = await createCampaign(actor, input);
  return jsonOk(campaign, { status: 201 });
});
