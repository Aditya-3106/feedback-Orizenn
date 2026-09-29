"use client";

import { useState } from "react";
import type { TextResponsesBlock as TextResponsesBlockType } from "@/lib/analytics/types";
import { formatNumber } from "@/lib/utils/format";
import { QuestionBlockCard } from "./QuestionBlockCard";

const PAGE = 5;

/**
 * SHORT_TEXT (PRD §37): keyword chips plus the actual responses (never
 * paraphrased), five at a time with "Show more".
 */
export function TextResponsesBlock({ block, showPercent = true }: { block: TextResponsesBlockType; showPercent?: boolean }) {
  const [visible, setVisible] = useState(PAGE);
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? block.responses.filter((r) => r.text.toLowerCase().includes(filter.toLowerCase())) : block.responses;
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  return (
    <QuestionBlockCard block={block} showPercent={showPercent}>
      {block.keywords.length ? (
        <div className="mb-4">
          <div className="mono-label mb-2">Most mentioned words</div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Keywords">
            {block.keywords.map((k) => {
              const active = filter === k.word;
              return (
                <li key={k.word}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setFilter(active ? null : k.word);
                      setVisible(PAGE);
                    }}
                    className={
                      active
                        ? "inline-flex items-center gap-1.5 rounded-md border border-orizenn-blue bg-orizenn-blue-soft px-2 py-1 text-xs text-orizenn-ink"
                        : "inline-flex items-center gap-1.5 rounded-md border border-orizenn-border bg-orizenn-surface px-2 py-1 text-xs text-orizenn-ink hover:bg-orizenn-bg"
                    }
                  >
                    {k.word}
                    <span className="font-mono text-[11px] tabular-nums text-orizenn-subtle">{k.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {filter ? (
            <p className="hint mt-2">
              Showing responses mentioning “{filter}”.{" "}
              <button type="button" className="underline hover:text-orizenn-ink" onClick={() => setFilter(null)}>
                Show all
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {block.responses.length === 0 ? (
        <p className="text-sm text-orizenn-muted">No written answers yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-orizenn-border" aria-label="Responses">
            {shown.map((r) => (
              <li key={r.submissionId} className="py-2.5 text-sm leading-relaxed text-orizenn-ink">
                <p className="whitespace-pre-line break-words">{r.text}</p>
                {r.quotable ? <p className="mono-label mt-1 text-orizenn-subtle">Consented to quote</p> : null}
              </li>
            ))}
          </ul>
          {shown.length === 0 ? <p className="text-sm text-orizenn-muted">No responses match this keyword.</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {remaining > 0 ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setVisible((v) => v + PAGE * 2)}>
                Show more ({formatNumber(remaining)} more)
              </button>
            ) : null}
            {visible > PAGE && filtered.length > PAGE ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setVisible(PAGE)}>
                Show less
              </button>
            ) : null}
            <span className="hint tabular-nums">
              {formatNumber(shown.length)} of {formatNumber(filtered.length)} shown
              {block.truncated ? " · only the most recent responses are listed" : null}
            </span>
          </div>
        </>
      )}
    </QuestionBlockCard>
  );
}
