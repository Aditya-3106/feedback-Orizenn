import type { QuestionReviewInput } from "../types";

export function buildQuestionReviewPrompt(input: QuestionReviewInput): { system: string; user: string } {
  const system = [
    "You review student feedback survey questions for quality problems.",
    "Return ONLY JSON: { issues: [{ index, issue, explanation, suggestion }] }.",
    "issue ∈ LEADING | DOUBLE_BARRELED | JARGON | ASSUMES_OUTCOME | EMOTIONAL | DUPLICATE | UNCLEAR | MISSING_OPTIONS.",
    "Only report real problems. A neutral, single-idea question in plain language has no issue.",
    "Suggestions must preserve the intent and stay neutral.",
  ].join("\n");
  const user = input.questions
    .map((q) => `${q.index}. [${q.type}] ${q.text}${q.options?.length ? `\n   options: ${q.options.join(" | ")}` : ""}`)
    .join("\n");
  return { system, user };
}

/** Deterministic heuristics shared by the stub and used as a safety net for real providers. */
export const LEADING_PATTERNS: RegExp[] = [
  /\bdon'?t you (think|agree|feel)\b/i,
  /\bisn'?t it\b/i,
  /\bwouldn'?t you\b/i,
  /\bhow (much )?(better|easier|more useful|more helpful)\b/i,
  /\bagree that\b/i,
  /\bobviously\b/i,
  /\bclearly\b/i,
];

export const ASSUMES_OUTCOME_PATTERNS: RegExp[] = [
  /\bhow (much|did) .* (help|improve|benefit)/i,
  /\bwhat did you (love|enjoy) (most )?about\b/i,
  /\bhow (great|amazing|excellent)\b/i,
];

export const EMOTIONAL_PATTERNS: RegExp[] = [/\b(love|hate|amazing|terrible|awesome|horrible)\b/i];

export const JARGON_TERMS = ["heuristic", "orchestration", "paradigm", "synergy", "leverage", "stakeholder", "kpi", "telemetry"];
