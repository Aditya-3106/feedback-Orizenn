import { describe, expect, it } from "vitest";
import { analyzeMultiChoice } from "@/lib/analytics/question-analyzers/multi-choice";
import { analyzeNumber } from "@/lib/analytics/question-analyzers/number";
import { analyzeRating } from "@/lib/analytics/question-analyzers/rating";
import { analyzeSingleChoice } from "@/lib/analytics/question-analyzers/single-choice";
import { analyzeText, keywordCounts, stem, tokenize } from "@/lib/analytics/question-analyzers/text";
import { analyzeYesNo } from "@/lib/analytics/question-analyzers/yes-no";
import { makeOptions, makeQuestion, ratingAnswers } from "../fixtures";

describe("analyzeRating (PRD §37, §109)", () => {
  const q = makeQuestion({ type: "RATING", text: "How useful was Orizenn?" });

  it("PRD §109 example: 10 responses → average 4.0, 5=40% 4=30% 3=20% 2=10% 1=0%", () => {
    const block = analyzeRating(q, ratingAnswers(q), 10);
    expect(block.kind).toBe("RATING_DISTRIBUTION");
    expect(block.answerCount).toBe(10);
    expect(block.answerRate).toBe(100);
    expect(block.average).toBe(4);
    expect(block.median).toBe(4);
    expect(block.min).toBe(1);
    expect(block.max).toBe(5);
    expect(block.distribution.map((d) => d.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(block.distribution.map((d) => d.count)).toEqual([0, 1, 2, 3, 4]);
    expect(block.distribution.map((d) => d.percent)).toEqual([0, 10, 20, 30, 40]);
    expect(block.favourablePercent).toBe(70);
    expect(block.accessibleSummary).toContain("10 answers, average 4.0 out of 5");
    expect(block.accessibleSummary).toContain("40% selected 5");
  });

  it("carries question metadata into the block", () => {
    const meta = makeQuestion({ type: "RATING", category: "Value", analytics: { displayPriority: 5, showInSummary: false } });
    const block = analyzeRating(meta, ratingAnswers(meta), 10);
    expect(block.id).toBe(`q:${meta.id}`);
    expect(block.questionId).toBe(meta.id);
    expect(block.questionKey).toBe(meta.key);
    expect(block.title).toBe(meta.text);
    expect(block.category).toBe("Value");
    expect(block.displayPriority).toBe(5);
    expect(block.showInSummary).toBe(false);
  });

  it("answerRate is relative to total responses, not answers", () => {
    const block = analyzeRating(q, ratingAnswers(q), 20);
    expect(block.answerRate).toBe(50);
  });

  it("SCALE questions produce a SCALE_DISTRIBUTION with 0–10 buckets", () => {
    const scale = makeQuestion({ type: "SCALE" });
    const block = analyzeRating(scale, { questionId: scale.id, answerCount: 2, numberCounts: [{ value: 0, count: 1 }, { value: 10, count: 1 }] }, 2);
    expect(block.kind).toBe("SCALE_DISTRIBUTION");
    expect(block.min).toBe(0);
    expect(block.max).toBe(10);
    expect(block.distribution).toHaveLength(11);
    expect(block.average).toBe(5);
  });

  it("handles no data", () => {
    const block = analyzeRating(q, undefined, 0);
    expect(block.answerCount).toBe(0);
    expect(block.answerRate).toBe(0);
    expect(block.average).toBeNull();
    expect(block.median).toBeNull();
    expect(block.favourablePercent).toBeNull();
    expect(block.distribution.every((d) => d.count === 0 && d.percent === 0)).toBe(true);
    expect(block.accessibleSummary).toBe("No answers yet.");
  });

  it("merges duplicate value rows", () => {
    const block = analyzeRating(q, { questionId: q.id, answerCount: 3, numberCounts: [{ value: 5, count: 1 }, { value: 5, count: 2 }] }, 3);
    expect(block.distribution[4].count).toBe(3);
  });
});

describe("analyzeSingleChoice (PRD §37)", () => {
  const q = makeQuestion({ type: "SINGLE_CHOICE", options: makeOptions(["Yes", "No", "Not sure"]) });

  it("counts and percentages per option, in authored order, with the top option", () => {
    const block = analyzeSingleChoice(q, { questionId: q.id, answerCount: 4, textCounts: [{ value: "no", count: 1 }, { value: "yes", count: 3 }] }, 4);
    expect(block.kind).toBe("OPTION_DISTRIBUTION");
    expect(block.distribution.map((d) => d.label)).toEqual(["Yes", "No", "Not sure"]);
    expect(block.distribution.map((d) => d.count)).toEqual([3, 1, 0]);
    expect(block.distribution.map((d) => d.percent)).toEqual([75, 25, 0]);
    expect(block.top?.label).toBe("Yes");
    expect(block.accessibleSummary).toContain("75% chose “Yes”");
  });

  it("appends unknown legacy values at the end", () => {
    const block = analyzeSingleChoice(q, { questionId: q.id, answerCount: 2, textCounts: [{ value: "yes", count: 1 }, { value: "legacy", count: 1 }] }, 2);
    expect(block.distribution.at(-1)).toEqual({ value: "legacy", label: "legacy", count: 1, percent: 50 });
  });

  it("no data → no top option", () => {
    const block = analyzeSingleChoice(q, undefined, 0);
    expect(block.top).toBeNull();
    expect(block.accessibleSummary).toBe("No answers yet.");
  });

  it("DROPDOWN with SEGMENT_DISTRIBUTION keeps that kind", () => {
    const dd = makeQuestion({ type: "DROPDOWN", options: makeOptions(["A", "B"]) });
    expect(analyzeSingleChoice(dd, undefined, 0).kind).toBe("SEGMENT_DISTRIBUTION");
  });
});

describe("analyzeMultiChoice (PRD §37)", () => {
  const q = makeQuestion({ type: "MULTIPLE_CHOICE", options: makeOptions(["A", "B", "C"]) });

  it("percent is the share of respondents who selected the option; duplicates within one answer count once", () => {
    const block = analyzeMultiChoice(q, { questionId: q.id, answerCount: 3, jsonValues: [["a", "b"], ["a"], ["a", "a", "c"]] }, 3);
    expect(block.kind).toBe("MULTI_SELECT_FREQUENCY");
    expect(block.items[0]).toEqual({ value: "a", label: "A", count: 3, percent: 100 });
    expect(block.items.map((i) => i.count)).toEqual([3, 1, 1]);
    expect(block.items.map((i) => i.percent)).toEqual([100, 33, 33]);
    expect(block.averageSelections).toBe(1.7);
    expect(block.accessibleSummary).toContain("3 respondents");
  });

  it("no data → null average", () => {
    const block = analyzeMultiChoice(q, undefined, 0);
    expect(block.averageSelections).toBeNull();
    expect(block.items).toHaveLength(3);
    expect(block.accessibleSummary).toBe("No answers yet.");
  });
});

describe("analyzeYesNo", () => {
  const q = makeQuestion({ type: "YES_NO" });

  it("computes yes percent", () => {
    const block = analyzeYesNo(q, { questionId: q.id, answerCount: 4, booleanCounts: { yes: 3, no: 1 } }, 4);
    expect(block.kind).toBe("YES_NO_DISTRIBUTION");
    expect(block.yes).toBe(3);
    expect(block.no).toBe(1);
    expect(block.yesPercent).toBe(75);
    expect(block.accessibleSummary).toBe("4 answers: 3 said yes (75%), 1 said no (25%).");
  });

  it("no data → null percent", () => {
    const block = analyzeYesNo(q, undefined, 0);
    expect(block.yesPercent).toBeNull();
    expect(block.yes).toBe(0);
  });
});

describe("analyzeNumber", () => {
  const q = makeQuestion({ type: "NUMBER" });

  it("average, median, min, max and buckets", () => {
    const block = analyzeNumber(q, { questionId: q.id, answerCount: 4, numberCounts: [{ value: 30, count: 2 }, { value: 10, count: 1 }, { value: 20, count: 1 }] }, 4);
    expect(block.kind).toBe("NUMBER_SUMMARY");
    expect(block.average).toBe(22.5);
    expect(block.median).toBe(25);
    expect(block.min).toBe(10);
    expect(block.max).toBe(30);
    expect(block.buckets.map((b) => b.label)).toEqual(["10", "20", "30"]);
    expect(block.buckets.map((b) => b.percent)).toEqual([25, 25, 50]);
  });

  it("no data", () => {
    const block = analyzeNumber(q, undefined, 0);
    expect(block.average).toBeNull();
    expect(block.min).toBeNull();
    expect(block.buckets).toEqual([]);
  });
});

describe("text helpers", () => {
  it("tokenize drops stopwords, punctuation, numbers and short words", () => {
    expect(tokenize("The explanations were very clear!")).toEqual(["explanations", "clear"]);
    expect(tokenize("I got 42 results, so-so")).toEqual(["results", "so-so"]);
  });

  it("stem groups common inflections", () => {
    expect(stem("explanations")).toBe(stem("explanation"));
    expect(stem("confusing")).toBe(stem("confused"));
    expect(stem("terms")).toBe("term");
    expect(stem("slowly")).toBe("slow");
  });

  it("keywordCounts counts each stem once per response and keeps only repeated words", () => {
    const kws = keywordCounts(["The explanations were very clear", "Clear explanations helped", "Nothing"]);
    expect(kws).toEqual([
      { word: "clear", count: 2 },
      { word: "explanations", count: 2 },
    ]);
  });
});

describe("analyzeText", () => {
  const q = makeQuestion({ type: "SHORT_TEXT", analyticsType: "TEXT_RESPONSES" });
  const texts = [
    { text: "The explanations were very clear", submissionId: "s1", submittedAt: null, consentToQuote: true },
    { text: "Clear explanations helped", submissionId: "s2", submittedAt: null, consentToQuote: false },
    { text: "Nothing", submissionId: "s3", submittedAt: null, consentToQuote: null },
  ];

  it("lists responses with quotability and keywords", () => {
    const block = analyzeText(q, { questionId: q.id, answerCount: 3, texts }, 3);
    expect(block.kind).toBe("TEXT_RESPONSES");
    expect(block.responses.map((r) => r.quotable)).toEqual([true, false, false]);
    expect(block.responses.map((r) => r.text)).toEqual(texts.map((t) => t.text));
    expect(block.keywords[0]).toEqual({ word: "clear", count: 2 });
    expect(block.truncated).toBe(false);
    expect(block.accessibleSummary).toContain("3 written answers");
  });

  it("truncates the response list but keeps keywords over all texts", () => {
    const block = analyzeText(q, { questionId: q.id, answerCount: 3, texts }, 3, { maxResponses: 1 });
    expect(block.responses).toHaveLength(1);
    expect(block.truncated).toBe(true);
    expect(block.keywords.length).toBeGreaterThan(0);
  });

  it("no data", () => {
    const block = analyzeText(q, undefined, 0);
    expect(block.responses).toEqual([]);
    expect(block.accessibleSummary).toBe("No written answers yet.");
  });
});
