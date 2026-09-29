import Link from "next/link";
import { LinkActions } from "@/components/campaign/LinkActions";
import { EmptyState, KeyValue, Section, StatCard, StatusBadge } from "@/components/ui/primitives";
import { loadDashboard } from "@/lib/analytics/load";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { can } from "@/lib/security/authz";
import { formatDate, formatDateTime, formatDuration, formatNumber, formatPercent } from "@/lib/utils/format";

export default async function CampaignOverviewPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}`);
  const [campaign, dashboard] = await Promise.all([getCampaign(actor, campaignId), loadDashboard(actor, campaignId, {})]);

  const published = campaign.versions.find((v) => v.status === "PUBLISHED");
  const draft = campaign.versions.find((v) => v.status === "DRAFT");
  const activeLink = campaign.links.find((l) => l.status === "ACTIVE") ?? campaign.links.find((l) => published && l.formVersionId === published.id);
  const baseUrl = (process.env.NEXT_PUBLIC_FEEDBACK_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canEdit = can(actor.role, "form:edit");
  const completion = dashboard?.metrics.find((m) => m.id === "stat:completion")?.value ?? "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total responses" value={formatNumber(campaign._count.submissions)} />
        <StatCard label="Completion rate" value={completion} />
        <StatCard label="Avg completion time" value={dashboard ? formatDuration(parseDuration(dashboard.metrics.find((m) => m.id === "stat:duration")?.value)) : "—"} />
        <StatCard label="Questions" value={published ? published._count.questions : draft ? draft._count.questions : 0} hint={published ? "published version" : draft ? "draft" : undefined} />
        <StatCard label="Published version" value={published ? `v${published.versionNumber}` : "—"} hint={published?.publishedAt ? formatDate(published.publishedAt) : undefined} />
      </div>

      {!published && !draft ? (
        <EmptyState
          title="No form yet."
          description="Reuse a previous form, start from a template, or build the questions yourself."
          action={
            canEdit ? (
              <Link href={`/admin/campaigns/${campaign.id}/source`} className="btn-primary">
                Build the form
              </Link>
            ) : null
          }
        />
      ) : null}

      {draft ? (
        <Section title={`Draft v${draft.versionNumber}`} description="Unpublished. Students cannot see this version yet." actions={canEdit ? <Link href={`/admin/campaigns/${campaign.id}/builder?version=${draft.id}`} className="btn-primary btn-sm">Open builder</Link> : null}>
          <p className="text-sm text-orizenn-muted">
            {draft._count.questions} {draft._count.questions === 1 ? "question" : "questions"} · created {formatDateTime(draft.createdAt)}
          </p>
        </Section>
      ) : null}

      {published && activeLink ? (
        <Section title="Feedback link" description="Share this with students. The slug is random and never derived from an id.">
          <LinkActions campaignId={campaign.id} link={activeLink} publicUrl={`${baseUrl}/f/${activeLink.slug}`} canManage={can(actor.role, "campaign:publish")} isCurrentVersion={activeLink.formVersionId === published.id} />
        </Section>
      ) : null}

      {dashboard && dashboard.responseCount > 0 ? (
        <Section title="Responses over time" description={dashboard.timeline.accessibleSummary} actions={<Link href={`/admin/campaigns/${campaign.id}/analytics`} className="btn-secondary btn-sm">Open analytics</Link>}>
          <ol className="flex h-28 items-end gap-1" aria-hidden>
            {dashboard.timeline.points.slice(-45).map((p) => {
              const max = Math.max(...dashboard.timeline.points.map((x) => x.count), 1);
              return (
                <li key={p.date} title={`${p.date}: ${p.count}`} className="flex-1 rounded-t bg-orizenn-blue/80" style={{ height: `${Math.max(6, (p.count / max) * 100)}%` }} />
              );
            })}
          </ol>
          <div className="mt-3 space-y-1">
            {dashboard.summary.slice(0, 3).map((s) => (
              <p key={s} className="text-sm text-orizenn-ink">
                {s}
              </p>
            ))}
          </div>
        </Section>
      ) : published ? (
        <EmptyState compact title="No responses yet." description="Share your feedback link with students to start collecting responses." />
      ) : null}

      <Section title="Campaign">
        <KeyValue
          items={[
            { label: "Goal", value: campaign.goal },
            { label: "Audience", value: campaign.targetAudience ?? "—" },
            { label: "Response mode", value: <StatusBadge status={campaign.responseMode} /> },
            { label: "Student context", value: campaign.respondentFields.length ? campaign.respondentFields.join(", ") : "None" },
            { label: "Window", value: `${campaign.startsAt ? formatDate(campaign.startsAt) : "Open"} → ${campaign.endsAt ? formatDate(campaign.endsAt) : "No close date"}` },
            { label: "Response limit", value: campaign.maxResponses ? formatNumber(campaign.maxResponses) : "None" },
            { label: "Multiple responses", value: campaign.allowMultipleResponses ? "Allowed" : "One per student" },
            { label: "Quote consent", value: campaign.requireQuoteConsent ? "Asked on the form" : "Not asked" },
            { label: "Created", value: formatDateTime(campaign.createdAt) },
            { label: "Completion", value: dashboard ? formatPercent(dashboard.responseCount ? Number(completion.replace("%", "")) || 0 : 0) : "—" },
          ]}
        />
      </Section>
    </div>
  );
}

function parseDuration(v?: string): number | null {
  if (!v || v === "—") return null;
  const m = /(?:(\d+)m\s*)?(\d+)s/.exec(v);
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}
