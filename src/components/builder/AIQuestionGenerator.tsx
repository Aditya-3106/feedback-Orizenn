"use client";

import { useState } from "react";
import { generateQuestionsAction } from "@/actions/ai";
import { Modal } from "@/components/ui/client";
import { Notice } from "@/components/ui/primitives";
import type { QuestionReviewIssue, QuestionSuggestion } from "@/lib/ai/types";
import { QUESTION_TYPE_LABELS } from "@/lib/forms/definitions";
import type { QuestionDraftInput } from "@/lib/validation/question";

interface Row {
  suggestion: QuestionSuggestion;
  accepted: boolean;
  issues: QuestionReviewIssue[];
}

const ISSUE_LABELS: Record<QuestionReviewIssue["issue"], string> = {
  LEADING: "Potentially leading",
  DOUBLE_BARRELED: "Asks two things",
  JARGON: "Contains jargon",
  ASSUMES_OUTCOME: "Assumes an outcome",
  EMOTIONAL: "Loaded wording",
  DUPLICATE: "Duplicate",
  UNCLEAR: "Unclear",
  MISSING_OPTIONS: "Missing options",
};

export function AIQuestionGenerator({
  open,
  onClose,
  versionId,
  defaultGoal,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  versionId: string;
  defaultGoal: string;
  onAdd: (drafts: QuestionDraftInput[]) => Promise<void>;
}) {
  const [goal, setGoal] = useState(defaultGoal);
  const [count, setCount] = useState(6);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const r = await generateQuestionsAction(versionId, goal, count);
    setBusy(false);
    if (!r.success) {
      setError(r.error.fields?.goal?.[0] ?? r.error.message);
      return;
    }
    setRows(
      r.data.suggestions.map((s, i) => ({
        suggestion: s,
        accepted: true,
        issues: r.data.review.issues.filter((iss) => iss.index === i),
      })),
    );
  }

  const accepted = rows?.filter((r) => r.accepted) ?? [];

  async function add() {
    if (!accepted.length) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(accepted.map(({ suggestion }) => stripRationale(suggestion)));
      setRows(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the questions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Generate questions"
      description="Describe what you want to learn. Suggestions are checked for leading or double-barreled wording; nothing is added until you approve it."
      size="lg"
      footer={
        rows ? (
          <>
            <button type="button" className="btn-ghost" onClick={() => setRows(null)} disabled={busy}>
              Back
            </button>
            <button type="button" className="btn-secondary" onClick={generate} disabled={busy}>
              Regenerate
            </button>
            <button type="button" className="btn-primary" onClick={add} disabled={busy || accepted.length === 0}>
              {busy ? "Adding…" : `Add ${accepted.length} ${accepted.length === 1 ? "question" : "questions"}`}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={generate} disabled={busy || goal.trim().length < 10}>
              {busy ? "Generating…" : "Generate"}
            </button>
          </>
        )
      }
    >
      {error ? (
        <div className="mb-4">
          <Notice tone="danger" title="Question generation could not be completed.">
            {error} Your existing questions are unchanged.
          </Notice>
        </div>
      ) : null}

      {!rows ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="ai-goal" className="label">
              What do you want to learn from students?
            </label>
            <textarea id="ai-goal" rows={4} className="input mt-1" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="I want to know whether students understood Orizenn's capability results after our latest UI update." />
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="ai-count" className="label">
              Number of questions
            </label>
            <select id="ai-count" className="input w-24" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="hint">Recommended: 5–8 questions, 2–3 minutes.</span>
          </div>
        </div>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, i) => (
            <li key={i} className={`rounded-lg border p-3 ${row.accepted ? "border-orizenn-border" : "border-dashed border-orizenn-border opacity-60"}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1.5" checked={row.accepted} onChange={(e) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, accepted: e.target.checked } : r)))} aria-label={`Include suggestion ${i + 1}`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-orizenn-subtle">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hint">
                      {QUESTION_TYPE_LABELS[row.suggestion.type]}
                      {row.suggestion.category ? ` · ${row.suggestion.category}` : ""}
                    </span>
                  </div>
                  <textarea
                    className="input"
                    rows={2}
                    value={row.suggestion.text}
                    aria-label={`Suggestion ${i + 1} text`}
                    onChange={(e) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, suggestion: { ...r.suggestion, text: e.target.value } } : r)))}
                  />
                  {row.suggestion.options.length ? <div className="hint">Options: {row.suggestion.options.map((o) => o.label).join(" · ")}</div> : null}
                  {row.suggestion.rationale ? <div className="hint italic">{row.suggestion.rationale}</div> : null}
                  {row.issues.map((iss, k) => (
                    <div key={k} className="rounded-md border border-orizenn-warning/30 bg-orizenn-warning-soft px-3 py-2 text-sm">
                      <div className="font-medium text-orizenn-ink">Potential issue: {ISSUE_LABELS[iss.issue]}</div>
                      <div className="text-orizenn-muted">{iss.explanation}</div>
                      {iss.suggestion ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-orizenn-ink">Suggested: “{iss.suggestion}”</span>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, suggestion: { ...r.suggestion, text: iss.suggestion! }, issues: r.issues.filter((x) => x !== iss) } : r)))}>
                            Use suggestion
                          </button>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, issues: r.issues.filter((x) => x !== iss) } : r)))}>
                            Keep original
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

function stripRationale(s: QuestionSuggestion): QuestionDraftInput {
  const { rationale: _r, ...draft } = s;
  void _r;
  return draft;
}
