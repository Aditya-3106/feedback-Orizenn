import type { YesNoBlock as YesNoBlockType } from "@/lib/analytics/types";
import { formatNumber } from "@/lib/utils/format";
import { QuestionBlockCard } from "./QuestionBlockCard";

/**
 * YES_NO split (PRD §37): one bar, yes in blue and no in a neutral grey with a
 * 2px surface gap, both segments labelled with count and share. Server-safe.
 */
export function YesNoBlock({ block, showPercent = true }: { block: YesNoBlockType; showPercent?: boolean }) {
  const total = block.yes + block.no;
  const yesPct = block.yesPercent ?? 0;
  const noPct = total ? 100 - yesPct : 0;

  return (
    <QuestionBlockCard
      block={block}
      showPercent={showPercent}
      aside={
        total > 0 && showPercent ? (
          <div className="text-right">
            <div className="mono-label">Said yes</div>
            <div className="mt-1 font-display text-3xl leading-none text-orizenn-ink">{yesPct}%</div>
          </div>
        ) : null
      }
    >
      {total > 0 ? (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
            {block.yes > 0 ? <div className="h-full rounded-l bg-orizenn-blue" style={{ width: `${yesPct}%` }} /> : null}
            {block.no > 0 ? <div className="h-full rounded-r bg-[#cbd3db]" style={{ width: `${noPct}%` }} /> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-orizenn-blue" aria-hidden="true" />
              <div>
                <dt className="text-orizenn-muted">Yes</dt>
                <dd className="font-mono text-sm tabular-nums text-orizenn-ink">
                  {formatNumber(block.yes)}
                  {showPercent ? <span className="text-orizenn-subtle"> · {yesPct}%</span> : null}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-[#cbd3db]" aria-hidden="true" />
              <div>
                <dt className="text-orizenn-muted">No</dt>
                <dd className="font-mono text-sm tabular-nums text-orizenn-ink">
                  {formatNumber(block.no)}
                  {showPercent ? <span className="text-orizenn-subtle"> · {noPct}%</span> : null}
                </dd>
              </div>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-sm text-orizenn-muted">No answers yet.</p>
      )}
    </QuestionBlockCard>
  );
}
