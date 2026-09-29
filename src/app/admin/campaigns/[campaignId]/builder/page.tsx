import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormBuilder } from "@/components/builder/FormBuilder";
import { Notice } from "@/components/ui/primitives";
import { isAppError } from "@/lib/api/errors";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { toQuestionDefinition } from "@/lib/forms/mapper";
import { getDraftVersion, getVersionForActor } from "@/lib/forms/service";
import { can } from "@/lib/security/authz";

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { campaignId } = await params;
  const { version: versionId } = await searchParams;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/builder`);
  if (!can(actor.role, "form:edit")) redirect(`/admin/campaigns/${campaignId}`);

  let campaign;
  let version;
  try {
    campaign = await getCampaign(actor, campaignId);
    version = versionId ? await getVersionForActor(actor, versionId) : await getDraftVersion(actor, campaignId);
  } catch (err) {
    if (isAppError(err)) notFound();
    throw err;
  }
  if (version && version.campaignId !== campaign.id) notFound();

  if (!version) redirect(`/admin/campaigns/${campaignId}/source`);

  if (version.status !== "DRAFT") {
    const draft = campaign.versions.find((v) => v.status === "DRAFT");
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Notice tone="info" title={`Version ${version.versionNumber} is ${version.status.toLowerCase()} and cannot be edited.`}>
          Published versions are immutable so responses stay interpretable. Create a new version to change the questions.
        </Notice>
        <div className="flex gap-2">
          {draft ? (
            <Link href={`/admin/campaigns/${campaignId}/builder?version=${draft.id}`} className="btn-primary">
              Open draft v{draft.versionNumber}
            </Link>
          ) : (
            <Link href={`/admin/campaigns/${campaignId}/source`} className="btn-primary">
              Create new version
            </Link>
          )}
          <Link href={`/admin/campaigns/${campaignId}/preview?version=${version.id}`} className="btn-secondary">
            Preview v{version.versionNumber}
          </Link>
        </div>
      </div>
    );
  }

  const publicBaseUrl = (process.env.NEXT_PUBLIC_FEEDBACK_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  return (
    <FormBuilder
      campaignId={campaign.id}
      campaignName={campaign.name}
      campaignGoal={campaign.goal}
      version={{ id: version.id, versionNumber: version.versionNumber, introText: version.introText }}
      initialQuestions={version.questions.map(toQuestionDefinition)}
      canPublish={can(actor.role, "campaign:publish")}
      canUseAI={can(actor.role, "ai:use")}
      publicBaseUrl={publicBaseUrl}
    />
  );
}
