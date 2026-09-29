import type { QuestionGenerationInput } from "../types";

/** PRD §20 quality rules, kept out of UI code (PRD §90). */
export const QUESTION_QUALITY_RULES = [
  "Avoid leading questions.",
  "Avoid double-barreled questions (one idea per question).",
  "Avoid emotional manipulation and loaded words.",
  "Avoid unnecessary jargon; use simple student language.",
  "Keep the form short: 5–8 questions, 2–3 minutes.",
  "Avoid duplicate or near-duplicate questions.",
  "Distinguish opinion from behavior.",
  "Do not assume a positive outcome.",
  "Provide appropriate, mutually exclusive response options for choice questions.",
  "Assign analytics metadata (category, analyticsType) to every question.",
  "Assign a comparableKey (snake_case) when the question measures a recurring concept.",
];

export function buildQuestionGenerationPrompt(input: QuestionGenerationInput): { system: string; user: string } {
  const system = [
    "You design short student feedback questionnaires for Orizenn, a product that explains students' technical strengths with evidence from their repositories.",
    "Return ONLY a JSON array of question objects with fields: text, type, options (labels, for choice types), required, category, analyticsType, comparableKey, rationale.",
    `Allowed types: SINGLE_CHOICE, MULTIPLE_CHOICE, RATING, SCALE, YES_NO, SHORT_TEXT, LONG_TEXT, NUMBER, DROPDOWN.`,
    "Allowed analyticsType per type: RATING→RATING_DISTRIBUTION, SCALE→SCALE_DISTRIBUTION, SINGLE_CHOICE→OPTION_DISTRIBUTION, MULTIPLE_CHOICE→MULTI_SELECT_FREQUENCY, YES_NO→YES_NO_DISTRIBUTION, NUMBER→NUMBER_SUMMARY, SHORT_TEXT→TEXT_RESPONSES, LONG_TEXT→THEME_CLUSTER, DROPDOWN→SEGMENT_DISTRIBUTION.",
    "Quality rules:",
    ...QUESTION_QUALITY_RULES.map((r) => `- ${r}`),
  ].join("\n");

  const user = [
    `Campaign: ${input.campaignName}`,
    `Goal: ${input.goal}`,
    input.audience ? `Audience: ${input.audience}` : null,
    input.existingQuestions.length
      ? `Existing questions (do not duplicate):\n${input.existingQuestions.map((q) => `- [${q.type}] ${q.text}`).join("\n")}`
      : null,
    `Generate ${input.count ?? 6} questions.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}
