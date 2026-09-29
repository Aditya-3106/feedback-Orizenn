"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateInsightsAction } from "@/actions/ai";
import { Notice } from "@/components/ui/primitives";
import { cn, formatDateTime, formatNumber } from "@/lib/utils/format";

/** Serialisable projection of an AIInsight row, prepared by the server page. */
export interface StoredInsight {
  id: string;
  type: "SUMMARY" | "FINDING";
  title: string;
  content: string;
  sourceQuestionIds: string[];
  sourceResponseCount: number;
  /** ISO timestamp. */
  createdAt: string;
  /** From metadataJson.kind on FINDING rows. */
  kind?: string;
  /** From metadataJson.quotes on SUMMARY rows (already consent-filtered). */
  quotes?: Array<{ questionId: string; text: string }>;
  filtered?: boolean;
}

const KIND_STYLES: Record<string, string> = {
  POSITIVE: "bg-orizenn-success-soft text-orizenn-success",
  FRICTION: "bg-orizenn-warning-soft text-orizenn-warning",
  OPPORTUNITY: "bg-orizenn-blue-soft text-orizenn-blue",
  UNEXPECTED: "bg-orizenn-danger-soft text-orizenn-danger",
  THEME: "bg-orizenn-bg text-orizenn-muted",
  FINDING: "bg-orizenn-bg text-orizenn-muted",
};

/**
 * AI insights (PRD §42–§43, §92). Shows stored insights for the current version
 * and lets a permitted user generate a fresh set for the current filters. Every
 * insight is labelled as AI-generated and cross-checked against the numbers.
 */
export function InsightBlock({
  campaignId,
  insights,
  filters,
  responseCount,
  minResponses,
  canGenerate,
  questionTitles,
}: {
  campaignId: string;
  insights: StoredInsight[];
  /** Current filters as plain strings (what the URL carries). */
  filters: Record<string, string | undefined>;
  responseCount: number;
  minResponses: number;
  canGenerate: boolean;
  /** questionId → question text, for "Based on" references. */
  questionTitles: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);

  const summaries = insights.filter((i) => i.type === "SUMMARY");
  const findings = insights.filter((i) => i.type === "FINDING");
  const latest = summaries[summaries.length - 1] ?? findings[findings.length - 1] ?? null;
  const tooFew = responseCount < minResponses;

  const generate = () => {
    setError(null);
    setJustGenerated(false);
    startTransition(async () => {
      const result = await generateInsightsAction(campaignId, filters);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setJustGenerated(true);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="insights-title" className="card p-5" aria-busy={pending}>
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 id="insights-title" className="font-display text-2xl text-orizenn-ink">
            Insights
          </h2>
          <p className="hint mt-1">
            AI-generated, cross-checked against the numbers above.
            {latest ? ` Last generated ${formatDateTime(latest.createdAt)} from ${formatNumber(latest.sourceResponseCount)} responses.` : ""}
          </p>
        </div>
        {canGenerate ? (
          <div className="flex flex-col items-start gap-1 md:items-end">
            <button type="button" className="btn-primary btn-sm" onClick={generate} disabled={pending || tooFew} aria-describedby={tooFew ? "insights-gate" : undefined}>
              {pending ? (
                <>
                  <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Generating…
                </>
              ) : insights.length ? (
                "Regenerate insights"
              ) : (
                "Generate insights"
              )}
            </button>
            {tooFew ? (
              <p id="insights-gate" className="hint tabular-nums">
                Insights need at least {minResponses} responses. This view has {formatNumber(responseCount)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="mt-4">
          <Notice tone="danger" title="Insights couldn’t be generated">
            {error}
          </Notice>
        </div>
      ) : null}
      {justGenerated && !error ? (
        <div className="mt-4">
          <Notice tone="success">New insights generated. Refreshing…</Notice>
        </div>
      ) : null}

      <div className={cn("mt-5 space-y-6 transition-opacity", pending && "opacity-60")}>
        {insights.length === 0 ? (
          <p className="text-sm text-orizenn-muted">
            {tooFew
              ? `Insights need at least ${minResponses} responses before they can be generated.`
              : canGenerate
                ? "No insights yet for this version. Generate a set from the current view."
                : "No insights have been generated for this version yet."}
          </p>
        ) : null}

        {summaries.map((s) => (
          <article key={s.id} className="rounded-lg bg-orizenn-bg p-4" aria-labelledby={`${s.id}-title`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono-label">Summary</span>
              <span className="rounded-md bg-orizenn-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-orizenn-subtle">AI-generated</span>
              {s.filtered ? <span className="rounded-md bg-orizenn-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-orizenn-subtle">filtered view</span> : null}
            </div>
            <h3 id={`${s.id}-title`} className="mt-2 text-base font-medium text-orizenn-ink">
              {s.title}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-orizenn-ink">{s.content}</p>
            <p className="hint mt-2 tabular-nums">
              Based on {formatNumber(s.sourceResponseCount)} responses · {formatDateTime(s.createdAt)}
            </p>
            {s.quotes?.length ? (
              <div className="mt-4">
                <div className="mono-label mb-2">Representative feedback</div>
                <ul className="grid gap-3 md:grid-cols-2">
                  {s.quotes.map((q, i) => (
                    <li key={`${s.id}-q${i}`}>
                      <figure className="h-full rounded-lg bg-orizenn-surface p-3">
                        <blockquote className="font-display text-base leading-snug text-orizenn-ink">“{q.text}”</blockquote>
                        <figcaption className="mt-1.5 text-xs text-orizenn-subtle">
                          — Anonymous respondent
                          {questionTitles[q.questionId] ? ` · ${questionTitles[q.questionId]}` : ""}
                        </figcaption>
                      </figure>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}

        {findings.length ? (
          <div>
            <h3 className="mono-label mb-3">Findings</h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {findings.map((f) => {
                const kind = (f.kind ?? "FINDING").toUpperCase();
                const sources = f.sourceQuestionIds.map((id) => questionTitles[id]).filter((t): t is string => !!t);
                return (
                  <li key={f.id} className="rounded-lg border border-orizenn-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]", KIND_STYLES[kind] ?? KIND_STYLES.FINDING)}>{kind.toLowerCase()}</span>
                      <span className="rounded-md bg-orizenn-bg px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-orizenn-subtle">AI-generated</span>
                    </div>
                    <h4 className="mt-2 text-sm font-medium text-orizenn-ink">{f.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-orizenn-muted">{f.content}</p>
                    {sources.length ? (
                      <p className="hint mt-2">
                        Based on: {sources.join(" · ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
