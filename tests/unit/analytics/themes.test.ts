import { describe, expect, it } from "vitest";
import { analyzeThemes, extractThemes } from "@/lib/analytics/question-analyzers/themes";
import { makeQuestion } from "../fixtures";

const item = (text: string, i: number) => ({ text, submissionId: `s${i + 1}`, quotable: i % 2 === 0 });

describe("extractThemes (PRD §37, §44) — deterministic keyword clustering", () => {
  const texts = [
    "The explanation of terms was confusing",
    "Explanations were confusing at first",
    "Great dashboard layout",
    "Dashboard loads slowly",
    "Nothing",
  ];
  const items = texts.map(item);

  it("returns [] for empty input", () => {
    expect(extractThemes([])).toEqual({ themes: [], uncategorised: 0 });
  });

  it("groups responses sharing a stem (explanation / explanations, confusing)", () => {
    const { themes } = extractThemes(items);
    const confusing = themes.find((t) => t.id === "theme:confus");
    expect(confusing).toBeDefined();
    expect(confusing?.responses.map((r) => r.submissionId)).toEqual(["s1", "s2"]);
    expect(confusing?.keywords).toEqual(["confusing", "explanation"]);
    expect(confusing?.name).toBe("Confusing · Explanation");
  });

  it("theme.count equals the number of member responses and percent is over all responses", () => {
    const { themes } = extractThemes(items);
    for (const t of themes) {
      expect(t.count).toBe(t.responses.length);
      expect(t.percent).toBe(Math.round((t.count / items.length) * 100));
    }
  });

  it("responses are the actual input texts, never fabricated", () => {
    const { themes } = extractThemes(items);
    for (const t of themes) {
      for (const r of t.responses) {
        const original = items.find((i) => i.submissionId === r.submissionId);
        expect(original).toBeDefined();
        expect(r.text).toBe(original?.text);
        expect(r.quotable).toBe(original?.quotable);
      }
    }
  });

  it("counts responses that belong to no theme as uncategorised", () => {
    const { themes, uncategorised } = extractThemes(items);
    expect(themes.map((t) => t.name)).toEqual(["Confusing · Explanation", "Dashboard"]);
    expect(uncategorised).toBe(1); // "Nothing"
  });

  it("does not create a second theme for a stem already absorbed as a related keyword", () => {
    const { themes } = extractThemes(items);
    expect(themes.some((t) => t.id === "theme:explan")).toBe(false);
  });

  it("respects maxThemes", () => {
    expect(extractThemes(items, { maxThemes: 1 }).themes).toHaveLength(1);
  });

  it("a single mention never forms a theme (minMentions default 2)", () => {
    const { themes, uncategorised } = extractThemes([item("Totally unique feedback", 0), item("Another distinct comment", 1)]);
    expect(themes).toEqual([]);
    expect(uncategorised).toBe(2);
  });

  it("groups the plural 'terms' with the singular 'term'", () => {
    const { themes } = extractThemes([item("Too many terms", 0), item("Each term needs a definition", 1), item("Fine", 2)]);
    expect(themes[0]?.id).toBe("theme:term");
    expect(themes[0]?.count).toBe(2);
  });

  /**
   * Known gap in `stem()` (src/lib/analytics/question-analyzers/text.ts:26):
   * "terminology" → "terminology" but "terminologies" → "terminolog", so the
   * y/ies pair does not share a stem. When the stemmer learns y→i this test
   * will start passing and should be flipped to a plain `it`.
   */
  it("groups 'terminology' with 'terminologies'", () => {
    const { themes } = extractThemes([
      item("Too much terminology", 0),
      item("The terminologies are hard", 1),
      item("Some terminology confused me", 2),
    ]);
    expect(themes[0]?.count).toBe(3);
  });
});

describe("analyzeThemes", () => {
  it("builds a THEME_CLUSTER block from text answers", () => {
    const q = makeQuestion({ type: "LONG_TEXT" });
    const data = {
      questionId: q.id,
      answerCount: 3,
      texts: [
        { text: "The dashboard is confusing", submissionId: "a", submittedAt: null, consentToQuote: true },
        { text: "Confusing dashboard colours", submissionId: "b", submittedAt: null, consentToQuote: false },
        { text: "Okay", submissionId: "c", submittedAt: null, consentToQuote: null },
      ],
    };
    const block = analyzeThemes(q, data, 3);
    expect(block.kind).toBe("THEME_CLUSTER");
    expect(block.source).toBe("deterministic");
    expect(block.themes).toHaveLength(1);
    expect(block.themes[0].count).toBe(2);
    expect(block.uncategorised).toBe(1);
    expect(block.responses.map((r) => r.quotable)).toEqual([true, false, false]);
    expect(block.accessibleSummary).toContain("3 written answers grouped into 1 themes");
  });

  it("no data", () => {
    const q = makeQuestion({ type: "LONG_TEXT" });
    const block = analyzeThemes(q, undefined, 0);
    expect(block.themes).toEqual([]);
    expect(block.uncategorised).toBe(0);
    expect(block.accessibleSummary).toBe("No written answers yet.");
  });
});
