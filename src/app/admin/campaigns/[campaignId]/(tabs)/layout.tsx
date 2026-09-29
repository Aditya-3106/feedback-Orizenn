import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CampaignStatusActions } from "@/components/campaign/CampaignStatusActions";
import { ClientTabs } from "@/components/ui/ClientTabs";
import { StatusBadge } from "@/components/ui/primitives";
import { isAppError } from "@/lib/api/errors";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { can } from "@/lib/security/authz";
import { formatNumber } from "@/lib/utils/format";

export default async function CampaignTabsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}`);

  let campaign;
  try {
    campaign = await getCampaign(actor, campaignId);
  } catch (err) {
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const base = `/admin/campaigns/${campaign.id}`;
  const published = campaign.versions.find((v) => v.status === "PUBLISHED");
  const draft = campaign.versions.find((v) => v.status === "DRAFT");
  const canEdit = can(actor.role, "form:edit");

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mono-label mb-2">
            <Link href="/admin/campaigns" className="hover:text-orizenn-ink">
              Campaigns
            </Link>{" "}
            / {campaign.slug}
          </div>
          <h1 className="font-display text-3xl leading-tight text-orizenn-ink md:text-4xl">{campaign.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-orizenn-muted">
            <StatusBadge status={campaign.status} />
            <span className="tabular-nums">{formatNumber(campaign._count.submissions)} responses</span>
            {published ? <span className="font-mono text-xs">v{published.versionNumber} published</span> : null}
            {draft ? <span className="font-mono text-xs">v{draft.versionNumber} draft</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2">
            {canEdit && draft ? (
              <Link href={`${base}/builder?version=${draft.id}`} className="btn-primary btn-sm">
                Edit draft
              </Link>
            ) : null}
            {canEdit && !draft ? (
              <Link href={`${base}/source`} className="btn-primary btn-sm">
                {published ? "New version" : "Build form"}
              </Link>
            ) : null}
            {published || draft ? (
              <Link href={`${base}/preview?version=${(draft ?? published)!.id}`} className="btn-secondary btn-sm">
                Preview
              </Link>
            ) : null}
            <Link href={`${base}/export`} className="btn-secondary btn-sm">
              Export
            </Link>
          </div>
          <CampaignStatusActions
            campaignId={campaign.id}
            status={campaign.status}
            hasPublished={!!published}
            responseCount={campaign._count.submissions}
            canPublish={can(actor.role, "campaign:publish")}
            canDelete={can(actor.role, "campaign:delete")}
          />
        </div>
      </div>

      <ClientTabs
        items={[
          { href: base, label: "Overview" },
          { href: `${base}/responses`, label: "Responses", count: campaign._count.submissions },
          { href: `${base}/analytics`, label: "Analytics" },
          { href: `${base}/versions`, label: "Versions", count: campaign.versions.length },
          { href: `${base}/export`, label: "Export" },
          { href: `${base}/settings`, label: "Settings" },
        ]}
      />

      <div>{children}</div>
    </div>
  );
}
