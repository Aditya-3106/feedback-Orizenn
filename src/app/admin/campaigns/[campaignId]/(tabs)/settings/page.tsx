import { updateCampaignAction } from "@/actions/campaigns";
import { CampaignForm } from "@/components/campaign/CampaignForm";
import { Notice } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { can } from "@/lib/security/authz";

export default async function CampaignSettingsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/settings`);
  const campaign = await getCampaign(actor, campaignId);

  if (!can(actor.role, "campaign:edit")) {
    return <Notice tone="info">Your role can view this campaign but not change its settings.</Notice>;
  }

  const boundAction = updateCampaignAction.bind(null, campaign.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {campaign._count.submissions > 0 ? (
        <Notice tone="warning" title="This campaign already has responses.">
          Changing the response mode does not alter stored data, but it changes what is shown. Identity that was never collected cannot be recovered.
        </Notice>
      ) : null}
      <CampaignForm
        mode="edit"
        action={boundAction}
        submitLabel="Save settings"
        initial={{
          name: campaign.name,
          description: campaign.description,
          goal: campaign.goal,
          targetAudience: campaign.targetAudience,
          responseMode: campaign.responseMode,
          allowMultipleResponses: campaign.allowMultipleResponses,
          requireQuoteConsent: campaign.requireQuoteConsent,
          respondentFields: campaign.respondentFields,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
          maxResponses: campaign.maxResponses,
        }}
      />
    </div>
  );
}
