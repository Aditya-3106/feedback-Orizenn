import { ExportForm } from "@/components/export/ExportForm";
import { EmptyState, Section, StatusBadge } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { listExportJobs } from "@/lib/exports/service";
import { getSegmentOptions } from "@/lib/submissions/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function ExportPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/export`);
  const [campaign, options, jobs] = await Promise.all([
    getCampaign(actor, campaignId),
    getSegmentOptions(actor, campaignId),
    listExportJobs(actor, campaignId),
  ]);

  if (!campaign.versions.length) {
    return <EmptyState compact title="Nothing to export yet." description="Build and publish a form first." />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Section title="Export data" description="Generated server-side from the same filtered query the dashboard uses.">
        <ExportForm
          campaignId={campaign.id}
          options={options}
          versions={campaign.versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, status: v.status }))}
        />
      </Section>
      <Section title="Recent exports">
        {jobs.length === 0 ? (
          <p className="hint">No exports yet.</p>
        ) : (
          <ul className="divide-y divide-orizenn-border text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-orizenn-ink">{j.type.replace(/_/g, " ").toLowerCase()}</span>
                  <StatusBadge status={j.status} />
                </div>
                <div className="hint mt-0.5">
                  {j.requestedBy.name} · {formatDateTime(j.createdAt)}
                </div>
                {j.fileName ? <div className="mt-0.5 truncate font-mono text-[11px] text-orizenn-subtle">{j.fileName}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
