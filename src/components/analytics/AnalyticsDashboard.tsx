import Link from "next/link";
import type { ReactNode } from "react";
import type { AnalyticsDashboard as AnalyticsDashboardType, QuestionBlock } from "@/lib/analytics/types";
import { MIN_RESPONSES_FOR_INSIGHT } from "@/lib/analytics/metrics";
import { formatNumber } from "@/lib/utils/format";
import { Notice } from "@/components/ui/primitives";
import { MultiSelectChart, NumberSummaryChart, OptionDistributionChart } from "./DistributionChart";
import { RatingChart } from "./RatingChart";
import { SegmentComparisonSection } from "./SegmentComparison";
import { StatRow } from "./StatBlock";
import { TextResponsesBlock } from "./TextResponsesBlock";
import { ThemeBlock } from "./ThemeBlock";
import { TimelineChart } from "./TimelineChart";
import { YesNoBlock } from "./YesNoBlock";

/**
 * Dynamic dashboard renderer (PRD §35, §87). Server-compatible composition that
 * walks the engine's typed blocks in the engine's order and dispatches purely on
 * `block.kind` — never on question wording or position.
 */
export function AnalyticsDashboard({
  dashboard,
  clearFiltersHref,
  insights,
}: {
  dashboard: AnalyticsDashboardType;
  /** Link that removes every filter; shown in the filtered notice. */
  clearFiltersHref?: string;
  /** Rendered AI insights section (kept as a slot so this component stays free of server actions). */
  insights?: ReactNode;
}) {
  const showPercent = !dashboard.insufficientData;
  const wide = new Set<QuestionBlock["kind"]>(["TEXT_RESPONSES", "THEME_CLUSTER"]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mono-label">Analytics · v{dashboard.versionNumber}</div>
          <h2 className="mt-1 font-display text-3xl leading-tight text-orizenn-ink md:text-4xl">{dashboard.headline}</h2>
          <p className="mt-1 text-sm text-orizenn-muted tabular-nums">
            {formatNumber(dashboard.responseCount)} {dashboard.responseCount === 1 ? "response" : "responses"}
            {dashboard.filtered ? " in this view" : ""}
          </p>
        </div>
      </header>

      {dashboard.filtered ? (
        <Notice
          tone="info"
          action={
            clearFiltersHref ? (
              <Link href={clearFiltersHref} className="shrink-0 text-sm font-medium text-orizenn-blue hover:underline">
                Clear filters
              </Link>
            ) : undefined
          }
        >
          Showing a filtered view · {formatNumber(dashboard.responseCount)} {dashboard.responseCount === 1 ? "response" : "responses"}
        </Notice>
      ) : null}

      {dashboard.insufficientData ? (
        <Notice tone="warning" title="Not enough responses yet for reliable percentages.">
          Counts are shown as they come in; percentages, summaries and insights unlock at {MIN_RESPONSES_FOR_INSIGHT} responses.
        </Notice>
      ) : null}

      {/* Metrics */}
      <StatRow blocks={dashboard.metrics} />

      {/* Deterministic summary */}
      <section aria-labelledby="summary-title" className="card p-5">
        <h2 id="summary-title" className="font-display text-2xl text-orizenn-ink">
          What the responses say
        </h2>
        <p className="hint mt-1">Deterministic summary computed from the numbers below — no AI involved.</p>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-orizenn-ink">
          {dashboard.summary.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orizenn-blue" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {dashboard.questionInsights.length ? (
          <details className="mt-4 border-t border-orizenn-border pt-3">
            <summary className="cursor-pointer select-none text-xs text-orizenn-subtle hover:text-orizenn-ink">By question</summary>
            <dl className="mt-3 grid gap-3 md:grid-cols-2">
              {dashboard.questionInsights.map((qi) => (
                <div key={qi.questionId} className="rounded-lg bg-orizenn-bg p-3">
                  <dt className="text-xs font-medium text-orizenn-ink">{qi.title}</dt>
                  <dd className="mt-1 text-sm text-orizenn-muted">{qi.sentence}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>

      {/* Timeline */}
      <TimelineChart block={dashboard.timeline} />

      {/* Question blocks, in the engine's order */}
      <section aria-labelledby="questions-title" className="space-y-4">
        <h2 id="questions-title" className="font-display text-2xl text-orizenn-ink">
          By question
        </h2>
        {dashboard.blocks.length === 0 ? (
          <p className="text-sm text-orizenn-muted">This form version has no questions.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard.blocks.map((block) => (
              <div key={block.id} className={wide.has(block.kind) ? "lg:col-span-2" : undefined}>
                <QuestionBlockView block={block} showPercent={showPercent} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Segments */}
      {showPercent ? <SegmentComparisonSection blocks={dashboard.segments} /> : null}

      {/* AI insights */}
      {insights}
    </div>
  );
}

/** Dispatch on the block's kind only (PRD §143: questions are data). */
export function QuestionBlockView({ block, showPercent }: { block: QuestionBlock; showPercent: boolean }) {
  switch (block.kind) {
    case "RATING_DISTRIBUTION":
    case "SCALE_DISTRIBUTION":
      return <RatingChart block={block} showPercent={showPercent} />;
    case "OPTION_DISTRIBUTION":
    case "SEGMENT_DISTRIBUTION":
      return <OptionDistributionChart block={block} showPercent={showPercent} />;
    case "MULTI_SELECT_FREQUENCY":
      return <MultiSelectChart block={block} showPercent={showPercent} />;
    case "NUMBER_SUMMARY":
      return <NumberSummaryChart block={block} showPercent={showPercent} />;
    case "YES_NO_DISTRIBUTION":
      return <YesNoBlock block={block} showPercent={showPercent} />;
    case "TEXT_RESPONSES":
      return <TextResponsesBlock block={block} showPercent={showPercent} />;
    case "THEME_CLUSTER":
      return <ThemeBlock block={block} showPercent={showPercent} />;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}
