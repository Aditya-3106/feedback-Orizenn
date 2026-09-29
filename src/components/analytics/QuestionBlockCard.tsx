import type { ReactNode } from "react";
import type { Comparison, QuestionBlock } from "@/lib/analytics/types";
import { cn, formatNumber } from "@/lib/utils/format";

/**
 * Shared card chrome for every question block (PRD §87). Renders the mono
 * question key, title, category chip and answer count, then the engine's
 * accessible summary twice: visually hidden for screen readers and inside a
 * small "Text summary" disclosure for everyone else.
 */
export function QuestionBlockCard({
  block,
  showPercent = true,
  aside,
  children,
  className,
}: {
  block: Pick<QuestionBlock, "id" | "questionKey" | "title" | "category" | "answerCount" | "answerRate" | "accessibleSummary" | "comparison">;
  /** False when the dashboard has too few responses for reliable percentages. */
  showPercent?: boolean;
  /** Extra header content, e.g. a stat or badge. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${block.id}-title`;
  const summaryId = `${block.id}-summary`;
  return (
    <article className={cn("card flex flex-col p-5", className)} aria-labelledby={headingId} aria-describedby={summaryId}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono-label text-orizenn-ink">{formatQuestionKey(block.questionKey)}</span>
            {block.category ? (
              <span className="inline-flex items-center rounded-md bg-orizenn-bg px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-orizenn-muted">
                {block.category}
              </span>
            ) : null}
            {block.comparison ? <ComparisonBadge comparison={block.comparison} /> : null}
          </div>
          <h3 id={headingId} className="mt-2 text-base font-medium leading-snug text-orizenn-ink">
            {block.title}
          </h3>
          <p className="hint mt-1 tabular-nums">
            {formatNumber(block.answerCount)} {block.answerCount === 1 ? "answer" : "answers"}
            {showPercent && block.answerCount > 0 ? ` · ${block.answerRate}% answer rate` : null}
          </p>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>

      <p id={summaryId} className="sr-only">
        {block.accessibleSummary}
      </p>

      <div className="mt-4 flex-1">{children}</div>

      <details className="mt-4 border-t border-orizenn-border pt-3 text-sm">
        <summary className="cursor-pointer select-none text-xs text-orizenn-subtle hover:text-orizenn-ink">Text summary</summary>
        <p className="mt-2 text-sm leading-relaxed text-orizenn-muted">{block.accessibleSummary}</p>
      </details>
    </article>
  );
}

/** "q3" / "Q3" / "3" → "Q03"; anything longer is shown as authored. */
export function formatQuestionKey(key: string): string {
  const m = /^q?(\d{1,3})$/i.exec(key.trim());
  if (m) return `Q${m[1].padStart(2, "0")}`;
  return key.toUpperCase();
}

/**
 * Version-over-version badge, e.g. "v2 3.8 → 4.2 (+0.4)". Only rendered when the
 * engine attached a comparison; never invented for new questions (PRD §39).
 */
export function ComparisonBadge({ comparison, className }: { comparison: Comparison; className?: string }) {
  const unit = comparison.unit === "percent" ? "%" : "";
  const sign = comparison.delta > 0 ? "+" : "";
  const direction = comparison.delta > 0 ? "up" : comparison.delta < 0 ? "down" : "unchanged";
  const tone =
    comparison.delta > 0
      ? "bg-orizenn-success-soft text-orizenn-success"
      : comparison.delta < 0
        ? "bg-orizenn-danger-soft text-orizenn-danger"
        : "bg-orizenn-bg text-orizenn-muted";
  const arrow = comparison.delta > 0 ? "▲" : comparison.delta < 0 ? "▼" : "→";
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] tabular-nums", tone, className)}
      title={`Compared with version ${comparison.previousVersionNumber}`}
    >
      <span aria-hidden="true">{arrow}</span>
      <span className="sr-only">{direction} versus</span>
      <span>
        v{comparison.previousVersionNumber} {comparison.previous}
        {unit} → {comparison.current}
        {unit} ({sign}
        {comparison.delta}
        {unit})
      </span>
    </span>
  );
}
