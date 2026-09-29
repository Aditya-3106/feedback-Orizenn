import type { SegmentComparisonBlock } from "@/lib/analytics/types";
import { MIN_RESPONSES_FOR_INSIGHT } from "@/lib/analytics/metrics";
import { cn, formatNumber } from "@/lib/utils/format";

/**
 * Cross-segment comparison for one numeric or yes/no question (PRD §47).
 * Horizontal bars per group with the value and sample size as text; the
 * highest group is the only bar in full blue. Server-safe.
 */
export function SegmentComparison({ block }: { block: SegmentComparisonBlock }) {
  const unit = block.unit === "percent" ? "%" : "";
  const max = block.unit === "percent" ? 100 : Math.max(0, ...block.rows.map((r) => r.value));
  const best = block.rows.reduce<number>((m, r) => Math.max(m, r.value), Number.NEGATIVE_INFINITY);
  const headingId = `${block.id}-title`;
  const summaryId = `${block.id}-summary`;

  return (
    <article className="card p-5" aria-labelledby={headingId} aria-describedby={summaryId}>
      <header>
        <div className="mono-label">
          {block.unit === "percent" ? "Share who said yes" : "Average"} · by {block.by}
        </div>
        <h3 id={headingId} className="mt-1 text-base font-medium leading-snug text-orizenn-ink">
          {block.title}
        </h3>
      </header>
      <p id={summaryId} className="sr-only">
        {block.accessibleSummary}
      </p>

      <ol className="mt-4 space-y-2.5" aria-label={`By ${block.by}`}>
        {block.rows.map((r) => {
          const isBest = r.value === best;
          const small = r.count < MIN_RESPONSES_FOR_INSIGHT;
          const width = max > 0 ? (Math.max(r.value, 0) / max) * 100 : 0;
          return (
            <li key={r.label} className="-mx-1 rounded-md px-1 py-0.5 hover:bg-orizenn-bg">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cn("min-w-0 truncate", isBest ? "font-medium text-orizenn-ink" : "text-orizenn-muted")} title={r.label}>
                  {r.label}
                  <span className="ml-1.5 font-mono text-[11px] text-orizenn-subtle">n={formatNumber(r.count)}</span>
                  {small ? <span className="ml-1.5 rounded bg-orizenn-warning-soft px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-orizenn-warning">small sample</span> : null}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-orizenn-ink">
                  {r.value}
                  {unit}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-r bg-orizenn-bg" aria-hidden="true">
                <div className={cn("h-2 rounded-r", isBest ? "bg-orizenn-blue" : "bg-[#a6c4ff]")} style={{ width: `${Math.max(width, r.value > 0 ? 1.5 : 0)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>

      <details className="mt-4 border-t border-orizenn-border pt-3">
        <summary className="cursor-pointer select-none text-xs text-orizenn-subtle hover:text-orizenn-ink">Text summary</summary>
        <p className="mt-2 text-sm leading-relaxed text-orizenn-muted">{block.accessibleSummary}</p>
      </details>
    </article>
  );
}

export function SegmentComparisonSection({ blocks }: { blocks: SegmentComparisonBlock[] }) {
  if (!blocks.length) return null;
  const by = blocks[0].by;
  return (
    <section aria-labelledby="segments-title" className="space-y-4">
      <div>
        <h2 id="segments-title" className="font-display text-2xl text-orizenn-ink">
          Compare by {by}
        </h2>
        <p className="hint mt-1">Groups with fewer than {MIN_RESPONSES_FOR_INSIGHT} responses are marked; treat their values as indicative only.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map((b) => (
          <SegmentComparison key={b.id} block={b} />
        ))}
      </div>
    </section>
  );
}
