import { redirect } from "next/navigation";
import { createCampaignAction } from "@/actions/campaigns";
import { CampaignForm } from "@/components/campaign/CampaignForm";
import { PageHeader } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { can } from "@/lib/security/authz";

export default async function NewCampaignPage() {
  const actor = await requireActorOrRedirect("/admin/campaigns/new");
  if (!can(actor.role, "campaign:create")) redirect("/admin/campaigns");

  return (
    <div className="mx-auto max-w-3xl space-y-8 fade-in">
      <PageHeader eyebrow="Step 1 of 2" title="Create a campaign" description="Name it, describe the goal, and choose how responses are stored. You'll pick the questions next." />
      <CampaignForm action={createCampaignAction} submitLabel="Continue to form" />
    </div>
  );
}
