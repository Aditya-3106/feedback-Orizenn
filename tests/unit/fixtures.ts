/**
 * Shared fixture builders for the domain-layer unit tests. Pure data — no
 * Prisma, no React. Every builder returns a fresh object so tests can mutate
 * freely without leaking state.
 */
import type {
  AnalyticsInput,
  QuestionAnswerData,
  TotalsData,
} from "@/lib/analytics/types";
import {
  DEFAULT_ANALYTICS_META,
  defaultAnalyticsType,
  defaultValidation,
  type FormDefinition,
  type OptionDefinition,
  type QuestionDefinition,
  type QuestionType,
} from "@/lib/forms/definitions";

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${(++counter).toString().padStart(3, "0")}`;

export function makeOptions(labels: string[]): OptionDefinition[] {
  return labels.map((label, i) => ({
    id: nextId("opt"),
    label,
    value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    position: i,
  }));
}

export function makeQuestion(overrides: Partial<QuestionDefinition> & { type?: QuestionType } = {}): QuestionDefinition {
  const type = overrides.type ?? "RATING";
  const id = overrides.id ?? nextId("q");
  return {
    id,
    key: overrides.key ?? `q_${id}`,
    position: 0,
    text: overrides.text ?? `Question ${id}`,
    description: null,
    type,
    required: true,
    category: null,
    analyticsType: defaultAnalyticsType(type),
    comparableKey: null,
    validation: { ...defaultValidation(type) },
    analytics: { ...DEFAULT_ANALYTICS_META },
    options: [],
    ...overrides,
  };
}

export function makeForm(
  questions: QuestionDefinition[],
  overrides: Partial<Omit<FormDefinition, "questions" | "campaign">> & {
    campaign?: Partial<FormDefinition["campaign"]>;
  } = {},
): FormDefinition {
  return {
    versionId: "v1",
    versionNumber: 1,
    introText: null,
    estimatedMinutes: null,
    ...overrides,
    campaign: {
      id: "c1",
      name: "September feedback",
      responseMode: "PSEUDONYMOUS",
      respondentFields: [],
      requireQuoteConsent: false,
      allowMultipleResponses: false,
      ...overrides.campaign,
    },
    questions,
  };
}

export function makeTotals(completed: number, overrides: Partial<TotalsData> = {}): TotalsData {
  return {
    totalSubmissions: completed,
    completedSubmissions: completed,
    startedCount: 0,
    abandonedCount: 0,
    invalidCount: 0,
    avgDurationSeconds: 120,
    avgCompletionPercent: 100,
    ...overrides,
  };
}

/** PRD §109 worked example: 10 responses, 5★=4, 4★=3, 3★=2, 2★=1, 1★=0. */
export const PRD_RATING_COUNTS = [
  { value: 5, count: 4 },
  { value: 4, count: 3 },
  { value: 3, count: 2 },
  { value: 2, count: 1 },
  { value: 1, count: 0 },
];

export function ratingAnswers(q: QuestionDefinition, counts = PRD_RATING_COUNTS): QuestionAnswerData {
  return {
    questionId: q.id,
    answerCount: counts.reduce((s, c) => s + c.count, 0),
    numberCounts: counts.map((c) => ({ ...c })),
  };
}

export function makeAnalyticsInput(
  questions: QuestionDefinition[],
  answers: Record<string, QuestionAnswerData>,
  overrides: Partial<Omit<AnalyticsInput, "questions" | "answers">> & { responses?: number } = {},
): AnalyticsInput {
  const { responses, ...rest } = overrides;
  const total = responses ?? Math.max(0, ...Object.values(answers).map((a) => a.answerCount));
  return {
    campaign: { id: "c1", name: "September feedback", goal: "Learn how students experience Orizenn.", responseMode: "PSEUDONYMOUS", status: "ACTIVE" },
    version: { id: "v1", versionNumber: 1, publishedAt: new Date("2026-09-01T00:00:00Z") },
    totals: makeTotals(total),
    timeline: total ? [{ date: "2026-09-01", count: total }] : [],
    filters: {},
    filtered: false,
    ...rest,
    questions,
    answers,
  };
}

/** Recursively freeze so any accidental mutation throws (strict mode). */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
