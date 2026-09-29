import type { InsightGenerationInput } from "../types";

/** PRD §43 safety rules. */
export const INSIGHT_SAFETY_RULES = [
  "Never invent statistics. Every number must appear in the provided analytics.",
  "Never invent student quotes. Quote only from the provided quotable responses, verbatim.",
  "Do not claim causation without evidence.",
  "Do not infer sensitive personal characteristics.",
  "Do not imply a majority exists without sufficient responses.",
  "Do not turn a small sample into a universal statement.",
  "Prefer 'N of M respondents selected X' over 'students love X'.",
  "Reference the source question ids for every finding.",
];

export function buildInsightPrompt(input: InsightGenerationInput): { system: string; user: string } {
  const system = [
    "You summarise student feedback analytics for the Orizenn team.",
    "Return ONLY JSON: { summary, findings: [{ title, description, kind, sourceQuestionIds }], representativeQuotes: [{ questionId, text }] }.",
    "kind ∈ POSITIVE | FRICTION | THEME | OPPORTUNITY | UNEXPECTED | FINDING.",
    "Rules:",
    ...INSIGHT_SAFETY_RULES.map((r) => `- ${r}`),
  ].join("\n");

  const d = input.dashboard;
  const blocks = d.blocks.map((b) => ({
    questionId: b.questionId,
    title: b.title,
    kind: b.kind,
    answerCount: b.answerCount,
    summary: b.accessibleSummary,
  }));

  const user = JSON.stringify(
    {
      campaign: input.campaign,
      responseCount: d.responseCount,
      filtered: d.filtered,
      deterministicSummary: d.summary,
      questionBlocks: blocks,
      themes: d.themes.map((t) => ({ questionId: t.questionId, themes: t.themes.map((x) => ({ name: x.name, count: x.count, percent: x.percent })) })),
      comparisons: d.comparisons,
      quotableResponses: input.quotableResponses.slice(0, 40),
      previousSummary: input.previousSummary,
    },
    null,
    0,
  );

  return { system, user };
}
