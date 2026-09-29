import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/analytics/engine";
import { LEADING_PATTERNS } from "@/lib/ai/prompts/question-review";
import { StubAIProvider } from "@/lib/ai/stub";
import {
  insightResultSchema,
  questionReviewResultSchema,
  questionSuggestionsSchema,
  themeResultSchema,
} from "@/lib/ai/types";
import { isChoiceType } from "@/lib/forms/definitions";
import { makeAnalyticsInput, makeQuestion, ratingAnswers } from "../fixtures";

const provider = new StubAIProvider();

describe("StubAIProvider.generateQuestions (PRD §19–§21, §91, §114)", () => {
  const input = {
    goal: "Understand whether students found the analysis useful and accurate, and what they changed afterwards.",
    campaignName: "September feedback",
    existingQuestions: [],
  };

  it("returns schema-valid suggestions", async () => {
    const out = await provider.generateQuestions(input);
    expect(out).toHaveLength(6);
    const parsed = questionSuggestionsSchema.safeParse(out);
    expect(parsed.success).toBe(true);
    for (const q of out) {
      if (isChoiceType(q.type)) expect(q.options.length).toBeGreaterThanOrEqual(2);
      else expect(q.options).toEqual([]);
      expect(q.category).toBeTruthy();
    }
  });

  it("puts goal-relevant templates first", async () => {
    const out = await provider.generateQuestions(input);
    expect(out[0].category).toBe("Understanding");
    expect(out.map((q) => q.category)).toEqual(expect.arrayContaining(["Value", "Accuracy", "Improvement"]));
  });

  it("clamps count to 3–8 and stays deterministic", async () => {
    expect(await provider.generateQuestions({ ...input, count: 1 })).toHaveLength(3);
    expect(await provider.generateQuestions({ ...input, count: 20 })).toHaveLength(8);
    expect(await provider.generateQuestions(input)).toEqual(await provider.generateQuestions(input));
  });

  it("never suggests duplicates of existing questions", async () => {
    const existing = "After using Orizenn, how clearly do you understand your technical strengths?";
    const out = await provider.generateQuestions({ ...input, existingQuestions: [{ text: existing, type: "SCALE", category: "Understanding" }] });
    expect(out.map((q) => q.text)).not.toContain(existing);
    expect(questionSuggestionsSchema.safeParse(out).success).toBe(true);
  });
});

describe("StubAIProvider.reviewQuestions", () => {
  it("flags the PRD leading question as LEADING with a neutral suggestion", async () => {
    const text = "Don't you think Orizenn makes your project much easier to understand?";
    const { issues } = await provider.reviewQuestions({ questions: [{ index: 0, text, type: "RATING" }] });
    const leading = issues.find((i) => i.issue === "LEADING");
    expect(leading).toBeDefined();
    expect(leading?.index).toBe(0);
    expect(leading?.suggestion).toBeDefined();
    expect(LEADING_PATTERNS.some((p) => p.test(leading?.suggestion ?? ""))).toBe(false);
    expect(leading?.suggestion).toMatch(/^How /);
    expect(leading?.suggestion).toMatch(/\?$/);
    expect(questionReviewResultSchema.safeParse({ issues }).success).toBe(true);
  });

  it("flags duplicates, jargon, missing options and double-barreled questions; leaves neutral questions alone", async () => {
    const { issues } = await provider.reviewQuestions({
      questions: [
        { index: 0, text: "How useful was the analysis?", type: "RATING" },
        { index: 1, text: "How useful was the analysis?", type: "RATING" },
        { index: 2, text: "Pick one", type: "SINGLE_CHOICE", options: ["Only"] },
        { index: 3, text: "How did you leverage the synergy?", type: "SHORT_TEXT" },
        { index: 4, text: "How clear was the report and how did you use it?", type: "SHORT_TEXT" },
        { index: 5, text: "What did you love about the dashboard?", type: "SHORT_TEXT" },
      ],
    });
    expect(issues.filter((i) => i.index === 0)).toEqual([]);
    expect(issues.find((i) => i.index === 1)).toMatchObject({ issue: "DUPLICATE", explanation: "Duplicate of question 0." });
    expect(issues.find((i) => i.index === 2)).toMatchObject({ issue: "MISSING_OPTIONS" });
    expect(issues.find((i) => i.index === 3)).toMatchObject({ issue: "JARGON", explanation: "Contains jargon: synergy, leverage." });
    expect(issues.find((i) => i.index === 4)).toMatchObject({ issue: "DOUBLE_BARRELED" });
    expect(issues.filter((i) => i.index === 5).map((i) => i.issue).sort()).toEqual(["ASSUMES_OUTCOME", "EMOTIONAL"]);
    expect(questionReviewResultSchema.safeParse({ issues }).success).toBe(true);
  });
});

describe("StubAIProvider.generateInsights", () => {
  it("only restates deterministic dashboard numbers and cites real questions", async () => {
    const qRating = makeQuestion({ type: "RATING", text: "How useful was Orizenn?", position: 0 });
    const qYesNo = makeQuestion({ type: "YES_NO", text: "Did you change anything?", position: 1 });
    const dashboard = buildDashboard(
      makeAnalyticsInput([qRating, qYesNo], {
        [qRating.id]: ratingAnswers(qRating),
        [qYesNo.id]: { questionId: qYesNo.id, answerCount: 10, booleanCounts: { yes: 7, no: 3 } },
      }, { responses: 10 }),
    );
    const quotable = [{ questionId: qRating.id, text: "Very helpful" }];
    const result = await provider.generateInsights({ campaign: { name: "Sept", goal: "Learn" }, dashboard, quotableResponses: quotable });

    expect(insightResultSchema.safeParse(result).success).toBe(true);
    expect(result.summary).toBe(dashboard.summary.join(" "));
    expect(result.findings).toHaveLength(2);
    const known = new Set(dashboard.blocks.map((b) => b.questionId));
    for (const f of result.findings) for (const id of f.sourceQuestionIds) expect(known.has(id)).toBe(true);
    expect(result.findings[0]).toMatchObject({ kind: "POSITIVE", description: "10 answers, average 4.0 / 5. 70% chose one of the top two values." });
    expect(result.findings[1]).toMatchObject({ kind: "POSITIVE", description: "7 of 10 respondents (70%) answered yes." });
    expect(result.representativeQuotes).toEqual(quotable);
  });
});

describe("StubAIProvider.extractThemes", () => {
  it("returns themes whose submission ids all come from the input", async () => {
    const responses = [
      { submissionId: "a", text: "The terminology was confusing" },
      { submissionId: "b", text: "Some terminology confused me" },
      { submissionId: "c", text: "Loved it" },
    ];
    const result = await provider.extractThemes({ question: { id: "q1", text: "What was confusing?" }, responses });
    expect(themeResultSchema.safeParse(result).success).toBe(true);
    expect(result.themes.length).toBeGreaterThan(0);
    const ids = new Set(responses.map((r) => r.submissionId));
    for (const t of result.themes) {
      expect(t.submissionIds.length).toBeGreaterThan(0);
      for (const id of t.submissionIds) expect(ids.has(id)).toBe(true);
    }
  });
});
