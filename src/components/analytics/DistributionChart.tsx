"use client";

import type { DistributionBucket, MultiSelectBlock, NumberSummaryBlock, OptionDistributionBlock } from "@/lib/analytics/types";
import { cn, formatDecimal, formatNumber } from "@/lib/utils/format";
import { QuestionBlockCard } from "./QuestionBlockCard";

/**
 * Horizontal bar list used by OPTION_DISTRIBUTION, SEGMENT_DISTRIBUTION,
 * MULTI_SELECT_FREQUENCY and the NUMBER_SUMMARY buckets. Plain HTML bars: the
 * label, count and share are visible text (never colour alone), the top value
 * is the only bar in full blue, and hovering/focusing a row lifts it.
 */
export function HorizontalBars({
  buckets,
  showPercent = true,
  percentLabel = "share",
  emptyMessage = "No answers yet.",
  scaleTo = "max",
}: {
  buckets: DistributionBucket[];
  showPercent?: boolean;
  /** Screen-reader wording for the percentage, e.g. "of respondents". */
  percentLabel?: string;
  emptyMessage?: string;
  /** Bars scale to the largest count (default) or to the full 0–100% range. */
  scaleTo?: "max" | "percent";
}) {
  const max = Math.max(0, ...buckets.map((b) => b.count));
  const topIndex = max > 0 ? buckets.findIndex((b) => b.count === max) : -1;
  if (!buckets.length || max === 0) return <p className="text-sm text-orizenn-muted">{emptyMessage}</p>;

  return (
    <ol className="space-y-2.5" aria-label="Distribution">
      {buckets.map((b, i) => {
        const width = scaleTo === "percent" ? b.percent : max ? (b.count / max) * 100 : 0;
        const isTop = i === topIndex;
        return (
          <li key={b.value} className="group -mx-1 rounded-md px-1 py-0.5 transition-colors hover:bg-orizenn-bg">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("min-w-0 truncate", isTop ? "font-medium text-orizenn-ink" : "text-orizenn-muted")} title={b.label}>
                {b.label}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-orizenn-ink">
                {formatNumber(b.count)}
                {showPercent ? (
                  <span className="text-orizenn-subtle">
                    {" "}
                    · {b.percent}%<span className="sr-only"> {percentLabel}</span>
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-r bg-orizenn-bg" aria-hidden="true">
              <div
                className={cn(
                  "h-2 rounded-r transition-[width,background-color]",
                  isTop ? "bg-orizenn-blue" : "bg-[#a6c4ff] group-hover:bg-[#7ea6ff]",
                )}
                style={{ width: `${Math.max(width, b.count > 0 ? 1.5 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DistributionTable({ buckets, showPercent, percentHeader = "Share" }: { buckets: DistributionBucket[]; showPercent: boolean; percentHeader?: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer select-none text-xs text-orizenn-subtle hover:text-orizenn-ink">Table view</summary>
      <table className="table mt-2">
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col" className="text-right">
              Answers
            </th>
            {showPercent ? (
              <th scope="col" className="text-right">
                {percentHeader}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.value}>
              <td>{b.label}</td>
              <td className="text-right tabular-nums">{formatNumber(b.count)}</td>
              {showPercent ? <td className="text-right tabular-nums">{b.percent}%</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** SINGLE_CHOICE / DROPDOWN (PRD §37). */
export function OptionDistributionChart({ block, showPercent = true }: { block: OptionDistributionBlock; showPercent?: boolean }) {
  return (
    <QuestionBlockCard
      block={block}
      showPercent={showPercent}
      aside={
        block.top && showPercent ? (
          <div className="text-right">
            <div className="mono-label">Most chosen</div>
            <div className="mt-1 font-display text-2xl leading-none text-orizenn-ink">{block.top.percent}%</div>
            <div className="hint mt-0.5 max-w-[12rem] truncate" title={block.top.label}>
              {block.top.label}
            </div>
          </div>
        ) : null
      }
    >
      <HorizontalBars buckets={block.distribution} showPercent={showPercent} />
      {block.answerCount > 0 ? <DistributionTable buckets={block.distribution} showPercent={showPercent} /> : null}
    </QuestionBlockCard>
  );
}

/** MULTIPLE_CHOICE: percent = share of respondents who selected each item (PRD §37). */
export function MultiSelectChart({ block, showPercent = true }: { block: MultiSelectBlock; showPercent?: boolean }) {
  return (
    <QuestionBlockCard
      block={block}
      showPercent={showPercent}
      aside={
        block.averageSelections != null ? (
          <div className="text-right">
            <div className="mono-label">Avg selections</div>
            <div className="mt-1 font-display text-2xl leading-none text-orizenn-ink">{formatDecimal(block.averageSelections, 1)}</div>
            <div className="hint mt-0.5">per respondent</div>
          </div>
        ) : null
      }
    >
      <HorizontalBars buckets={block.items} showPercent={showPercent} percentLabel="of respondents" scaleTo="percent" />
      {showPercent && block.answerCount > 0 ? <p className="hint mt-3">Percentages are the share of respondents who selected each option, so they add up to more than 100%.</p> : null}
      {block.answerCount > 0 ? <DistributionTable buckets={block.items} showPercent={showPercent} percentHeader="Respondents" /> : null}
    </QuestionBlockCard>
  );
}

/** NUMBER: average / median / range plus bucketed distribution (PRD §37). */
export function NumberSummaryChart({ block, showPercent = true }: { block: NumberSummaryBlock; showPercent?: boolean }) {
  const stats: Array<{ label: string; value: string }> = [
    { label: "Average", value: formatDecimal(block.average, 1) },
    { label: "Median", value: block.median == null ? "—" : String(block.median) },
    { label: "Min", value: block.min == null ? "—" : String(block.min) },
    { label: "Max", value: block.max == null ? "—" : String(block.max) },
  ];
  return (
    <QuestionBlockCard block={block} showPercent={showPercent}>
      <dl className="mb-4 grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="mono-label">{s.label}</dt>
            <dd className="mt-1 font-display text-2xl leading-none text-orizenn-ink tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <HorizontalBars buckets={block.buckets} showPercent={showPercent} />
      {block.answerCount > 0 ? <DistributionTable buckets={block.buckets} showPercent={showPercent} /> : null}
    </QuestionBlockCard>
  );
}
