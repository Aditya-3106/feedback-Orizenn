import { describe, expect, it, vi } from "vitest";
import { crossCheck } from "@/lib/ai/service";
import { StubAIProvider } from "@/lib/ai/stub";
import { insightResultSchema, questionSuggestionsSchema, type InsightResult } from "@/lib/ai/types";
import { buildDashboard } from "@/lib/analytics/engine";
import { makeAnalyticsInput, makeQuestion, ratingAnswers } from "../fixtures";

// service.ts pulls in the Prisma client at module load; the pure crossCheck
// function does not need it, so stub the module out (hoisted by vitest).
vi.mock("@/lib/db/client", () => ({ prisma: {} }));

describe("AI output contract — questionSuggestionsSchema (PRD §91, §114)", () => {
  const good = { text: "How useful was the analysis?", type: "RATING" };

  it("accepts the stub provider's output", async () => {
    const out = await new StubAIProvider().generateQuestions({ goal: "Understand usefulness and accuracy", campaignName: "x", existingQuestions: [] });
    expect(questionSuggestionsSchema.safeParse(out).success).toBe(true);
  });

  it("rejects an unknown question type such as EMOJI", () => {
    const r = questionSuggestionsSchema.safeParse([good, { text: "React with an emoji", type: "EMOJI" }]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.path.join(".") === "1.type")).toBe(true);
  });

  it("rejects a suggestion without text", () => {
    const r = questionSuggestionsSchema.safeParse([{ type: "RATING" }]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].path).toEqual([0, "text"]);
  });

  it("rejects duplicate questions (ignoring punctuation and case)", () => {
    const r = questionSuggestionsSchema.safeParse([good, { text: "how useful was the analysis", type: "SCALE" }]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues).toEqual([expect.objectContaining({ path: [1, "text"], message: "Duplicate question." })]);
  });

  it("rejects an analytics type that does not fit the question type", () => {
    expect(questionSuggestionsSchema.safeParse([{ ...good, analyticsType: "THEME_CLUSTER" }]).success).toBe(false);
    expect(questionSuggestionsSchema.safeParse([{ ...good, analyticsType: "NUMBER_SUMMARY" }]).success).toBe(true);
  });

  it("rejects choice questions with fewer than 2 options", () => {
    expect(questionSuggestionsSchema.safeParse([{ text: "Pick one", type: "SINGLE_CHOICE", options: [{ label: "Only" }] }]).success).toBe(false);
    expect(questionSuggestionsSchema.safeParse([{ text: "Pick one", type: "SINGLE_CHOICE", options: [{ label: "A" }, { label: "B" }] }]).success).toBe(true);
  });

  it("rejects empty arrays and more than 12 suggestions", () => {
    expect(questionSuggestionsSchema.safeParse([]).success).toBe(false);
    const many = Array.from({ length: 13 }, (_, i) => ({ text: `Question number ${i}`, type: "RATING" }));
    expect(questionSuggestionsSchema.safeParse(many).success).toBe(false);
  });

  it("caps the rationale and tolerates its absence", () => {
    expect(questionSuggestionsSchema.safeParse([{ ...good, rationale: "x".repeat(401) }]).success).toBe(false);
    expect(questionSuggestionsSchema.safeParse([{ ...good, rationale: "short" }]).success).toBe(true);
  });
});

describe("AI output contract — insightResultSchema (PRD §92)", () => {
  it("requires a summary and at least one source question per finding", () => {
    expect(insightResultSchema.safeParse({ summary: "", findings: [] }).success).toBe(false);
    expect(insightResultSchema.safeParse({ summary: "ok", findings: [{ title: "t", description: "d", sourceQuestionIds: [] }] }).success).toBe(false);
    const r = insightResultSchema.safeParse({ summary: "ok", findings: [{ title: "t", description: "d", sourceQuestionIds: ["q1"] }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.findings[0].kind).toBe("FINDING");
    expect(r.data.representativeQuotes).toEqual([]);
  });

  it("rejects unknown finding kinds", () => {
    expect(
      insightResultSchema.safeParse({ summary: "ok", findings: [{ title: "t", description: "d", kind: "HYPE", sourceQuestionIds: ["q1"] }] }).success,
    ).toBe(false);
  });
});

describe("crossCheck (PRD §43, §92) — numbers and quotes are verified against deterministic data", () => {
  const qRating = makeQuestion({ id: "qr", type: "RATING", text: "How useful was Orizenn?", position: 0 });
  const qYesNo = makeQuestion({ id: "qy", type: "YES_NO", text: "Did you change anything?", position: 1 });
  const dashboard = buildDashboard(
    makeAnalyticsInput([qRating, qYesNo], {
      qr: ratingAnswers(qRating),
      qy: { questionId: "qy", answerCount: 10, booleanCounts: { yes: 7, no: 3 } },
    }, { responses: 10 }),
  );
  const quotable = [
    { questionId: "qr", text: "Verbatim quote about clarity" },
    { questionId: "qy", text: "Another real answer" },
  ];

  const finding = (description: string, sourceQuestionIds: string[], title = "Finding") => ({
    title,
    description,
    kind: "FINDING" as const,
    sourceQuestionIds,
  });

  function result(overrides: Partial<InsightResult>): InsightResult {
    return insightResultSchema.parse({ summary: "10 students responded.", findings: [], representativeQuotes: [], ...overrides });
  }

  it("keeps findings whose numbers and question ids are all real", () => {
    const valid = finding("4 of 10 selected 5, an average of 4.0 out of 5 (70% favourable).", ["qr"], "Valid");
    const out = crossCheck(result({ findings: [valid] }), dashboard, quotable);
    expect(out.findings).toEqual([valid]);
    expect(out.summary).toBe("10 students responded.");
  });

  it("drops findings citing unknown question ids", () => {
    const out = crossCheck(result({ findings: [finding("4 of 10 selected 5.", ["qr", "ghost"]), finding("7 said yes.", ["nope"])] }), dashboard, quotable);
    expect(out.findings).toEqual([]);
  });

  it("drops findings citing numbers that are not on the dashboard", () => {
    const fabricated = finding("99 students loved it.", ["qr"]);
    const preciseButWrong = finding("Average 4.05 out of 5.", ["qr"]);
    const fine = finding("7 of 10 respondents (70%) answered yes.", ["qy"], "Fine");
    const out = crossCheck(result({ findings: [fabricated, preciseButWrong, fine] }), dashboard, quotable);
    expect(out.findings).toEqual([fine]);
  });

  it("findings without any number pass the numeric check", () => {
    const wordsOnly = finding("Students mostly found the analysis useful.", ["qr"]);
    expect(crossCheck(result({ findings: [wordsOnly] }), dashboard, quotable).findings).toEqual([wordsOnly]);
  });

  it("drops quotes that are not verbatim copies of real responses or cite unknown questions", () => {
    const out = crossCheck(
      result({
        representativeQuotes: [
          { questionId: "qr", text: "  Verbatim quote about clarity  " },
          { questionId: "qr", text: "Verbatim quote about clarity!" },
          { questionId: "qr", text: "A made-up quote" },
          { questionId: "ghost", text: "Another real answer" },
          { questionId: "qy", text: "Another real answer" },
        ],
      }),
      dashboard,
      quotable,
    );
    // The schema trims quote text before crossCheck compares trimmed values.
    expect(out.representativeQuotes).toEqual([
      { questionId: "qr", text: "Verbatim quote about clarity" },
      { questionId: "qy", text: "Another real answer" },
    ]);
  });

  it("replaces a summary that cites unknown numbers with the deterministic summary", () => {
    const out = crossCheck(result({ summary: "Exactly 777 students responded and 12345 loved it." }), dashboard, quotable);
    expect(out.summary).toBe(dashboard.summary.join(" "));
    expect(out.summary).toContain("10 students responded.");
  });

  it("keeps a summary whose numbers are all real", () => {
    const summary = "10 students responded; average 4 out of 5; 70% said yes.";
    expect(crossCheck(result({ summary }), dashboard, quotable).summary).toBe(summary);
  });

  it("passes the stub provider's own insights through unchanged", async () => {
    const raw = await new StubAIProvider().generateInsights({ campaign: { name: "x", goal: "y" }, dashboard, quotableResponses: quotable });
    const parsed = insightResultSchema.parse(raw);
    expect(crossCheck(parsed, dashboard, quotable)).toEqual(parsed);
  });
});
