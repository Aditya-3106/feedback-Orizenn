import { Suspense } from "react";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { InsightBlock, type StoredInsight } from "@/components/analytics/InsightBlock";
import { SegmentFilter, type SegmentQuestionOption } from "@/components/analytics/SegmentFilter";
import { EmptyState } from "@/components/ui/primitives";
import { getStoredInsights } from "@/lib/ai/service";
import { loadDashboard } from "@/lib/analytics/load";
import { MIN_RESPONSES_FOR_INSIGHT } from "@/lib/analytics/metrics";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { can } from "@/lib/security/authz";
import { getSegmentOptions } from "@/lib/submissions/service";
import { filtersFromSearchParams, filtersToSearchParams, hasActiveFilters } from "@/lib/validation/filters";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<SearchParams> }) {
  const { campaignId } = await params;
  const basePath = `/admin/campaigns/${campaignId}/analytics`;
  const actor = await requireActorOrRedirect(basePath);
  const filters = filtersFromSearchParams(await searchParams);

  const [dashboard, segmentOptions, campaign] = await Promise.all([
    loadDashboard(actor, campaignId, filters),
    getSegmentOptions(actor, campaignId),
    getCampaign(actor, campaignId),
  ]);

  const versions = campaign.versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, status: v.status }));
  const filtered = hasActiveFilters(filters);
  const clearFiltersHref = filters.versionId ? `${basePath}?versionId=${encodeURIComponent(filters.versionId)}` : basePath;

  const segmentQuestions: SegmentQuestionOption[] = (dashboard?.blocks ?? [])
    .filter((b) => b.kind === "OPTION_DISTRIBUTION" || b.kind === "SEGMENT_DISTRIBUTION" || b.kind === "YES_NO_DISTRIBUTION")
    .map((b) => ({ id: b.questionId, text: b.title }));

  const filterBar = (
    <Suspense fallback={<div className="card h-24 animate-pulse" aria-hidden="true" />}>
      <SegmentFilter options={segmentOptions} versions={versions} segmentQuestions={segmentQuestions} />
    </Suspense>
  );

  if (!dashboard) {
    return (
      <div className="space-y-6">
        {filtered || filters.versionId ? filterBar : null}
        <EmptyState title="Not enough responses yet." description="Analytics will become more useful as responses come in. Publish the form and share its link to start collecting feedback." />
      </div>
    );
  }

  if (dashboard.responseCount === 0) {
    return (
      <div className="space-y-6">
        {filterBar}
        <EmptyState
          title="Not enough responses yet."
          description={
            filtered
              ? "No responses match the current filters. Analytics will become more useful as responses come in — try clearing the filters."
              : "Analytics will become more useful as responses come in."
          }
        />
      </div>
    );
  }

  const stored = await getStoredInsights(actor, campaignId, dashboard.versionId);
  const insights: StoredInsight[] = stored.flatMap((row) => {
    // THEME rows belong to the theme extraction flow, not the insights panel.
    if (row.type !== "SUMMARY" && row.type !== "FINDING") return [];
    const meta = isRecord(row.metadataJson) ? row.metadataJson : {};
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      content: row.content,
      sourceQuestionIds: row.sourceQuestionIds,
      sourceResponseCount: row.sourceResponseCount,
      createdAt: row.createdAt.toISOString(),
      kind: typeof meta.kind === "string" ? meta.kind : undefined,
      filtered: meta.filtered === true,
      quotes: Array.isArray(meta.quotes)
        ? meta.quotes
            .filter((q): q is { questionId: string; text: string } => isRecord(q) && typeof q.questionId === "string" && typeof q.text === "string")
            .map((q) => ({ questionId: q.questionId, text: q.text }))
        : undefined,
    };
  });

  const questionTitles: Record<string, string> = {};
  for (const b of dashboard.blocks) questionTitles[b.questionId] = b.title;

  const rawFilters = Object.fromEntries(filtersToSearchParams(filters).entries());

  return (
    <div className="space-y-6">
      {filterBar}
      <AnalyticsDashboard
        dashboard={dashboard}
        clearFiltersHref={clearFiltersHref}
        insights={
          <InsightBlock
            campaignId={campaignId}
            insights={insights}
            filters={rawFilters}
            responseCount={dashboard.responseCount}
            minResponses={MIN_RESPONSES_FOR_INSIGHT}
            canGenerate={can(actor.role, "ai:use")}
            questionTitles={questionTitles}
          />
        }
      />
    </div>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
