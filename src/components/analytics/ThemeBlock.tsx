"use client";

import { useMemo, useState } from "react";
import type { ThemeClusterBlock } from "@/lib/analytics/types";
import { cn, formatNumber } from "@/lib/utils/format";
import { QuestionBlockCard } from "./QuestionBlockCard";

const PAGE = 5;
const MAX_QUOTES = 3;

/**
 * LONG_TEXT themes (PRD §37, §44–§45). Each theme lists the actual responses it
 * groups; clicking a theme reveals them. Representative quotes come only from
 * responses whose authors consented, attributed to an anonymous respondent.
 */
export function ThemeBlock({ block, showPercent = true }: { block: ThemeClusterBlock; showPercent?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);

  const theme = selected ? block.themes.find((t) => t.id === selected) ?? null : null;
  const responses = theme ? theme.responses : block.responses;
  const shown = responses.slice(0, visible);
  const remaining = responses.length - shown.length;

  const quotes = useMemo(() => block.responses.filter((r) => r.quotable).slice(0, MAX_QUOTES), [block.responses]);

  const select = (id: string | null) => {
    setSelected(id);
    setVisible(PAGE);
  };

  return (
    <QuestionBlockCard block={block} showPercent={showPercent}>
      {block.answerCount === 0 ? (
        <p className="text-sm text-orizenn-muted">No written answers yet.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Themes */}
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="mono-label">Themes</h4>
              <span className="hint">{block.source === "ai" ? "AI-assisted grouping" : "Keyword grouping"}</span>
            </div>
            {block.themes.length === 0 ? (
              <p className="text-sm text-orizenn-muted">No recurring theme yet — responses are listed on the right.</p>
            ) : (
              <ul className="space-y-1.5" aria-label="Themes">
                <li>
                  <button
                    type="button"
                    aria-pressed={selected === null}
                    onClick={() => select(null)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selected === null ? "border-orizenn-blue bg-orizenn-blue-soft text-orizenn-ink" : "border-orizenn-border text-orizenn-ink hover:bg-orizenn-bg",
                    )}
                  >
                    <span>All responses</span>
                    <span className="font-mono text-xs tabular-nums text-orizenn-subtle">{formatNumber(block.responses.length)}</span>
                  </button>
                </li>
                {block.themes.map((t) => {
                  const active = selected === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => select(active ? null : t.id)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                          active ? "border-orizenn-blue bg-orizenn-blue-soft" : "border-orizenn-border hover:bg-orizenn-bg",
                        )}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-orizenn-ink">{t.name}</span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-orizenn-ink">
                            {formatNumber(t.count)}
                            {showPercent ? <span className="text-orizenn-subtle"> · {t.percent}%</span> : null}
                          </span>
                        </span>
                        <span className="mt-1.5 block h-1.5 w-full rounded-r bg-orizenn-bg" aria-hidden="true">
                          <span className={cn("block h-1.5 rounded-r", active ? "bg-orizenn-blue" : "bg-[#a6c4ff]")} style={{ width: `${Math.max(t.percent, 1.5)}%` }} />
                        </span>
                        {t.keywords.length ? <span className="mt-1.5 block truncate text-xs text-orizenn-subtle">{t.keywords.join(" · ")}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {block.uncategorised > 0 && block.themes.length > 0 ? (
              <p className="hint mt-2 tabular-nums">
                {formatNumber(block.uncategorised)} {block.uncategorised === 1 ? "response doesn’t" : "responses don’t"} fit a recurring theme.
              </p>
            ) : null}
          </div>

          {/* Responses for the selection */}
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="mono-label">{theme ? `Responses · ${theme.name}` : "Responses"}</h4>
              <span className="hint tabular-nums">
                {formatNumber(shown.length)} of {formatNumber(responses.length)}
              </span>
            </div>
            {responses.length === 0 ? (
              <p className="text-sm text-orizenn-muted">No responses in this theme.</p>
            ) : (
              <ul className="divide-y divide-orizenn-border" aria-live="polite" aria-label={theme ? `Responses grouped under ${theme.name}` : "All responses"}>
                {shown.map((r) => (
                  <li key={r.submissionId} className="py-2.5 text-sm leading-relaxed text-orizenn-ink">
                    <p className="whitespace-pre-line break-words">{r.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {remaining > 0 ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setVisible((v) => v + PAGE * 2)}>
                  Show more ({formatNumber(remaining)} more)
                </button>
              ) : null}
              {visible > PAGE && responses.length > PAGE ? (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setVisible(PAGE)}>
                  Show less
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {quotes.length ? (
        <section className="mt-6 border-t border-orizenn-border pt-4" aria-labelledby={`${block.id}-quotes`}>
          <h4 id={`${block.id}-quotes`} className="mono-label mb-3">
            Representative feedback
          </h4>
          <ul className="grid gap-3 md:grid-cols-3">
            {quotes.map((q) => (
              <li key={q.submissionId}>
                <figure className="h-full rounded-lg bg-orizenn-bg p-4">
                  <blockquote className="font-display text-lg leading-snug text-orizenn-ink">“{q.text}”</blockquote>
                  <figcaption className="mt-2 text-xs text-orizenn-subtle">— Anonymous respondent</figcaption>
                </figure>
              </li>
            ))}
          </ul>
          <p className="hint mt-2">Only responses whose authors consented to being quoted are shown here.</p>
        </section>
      ) : null}
    </QuestionBlockCard>
  );
}
