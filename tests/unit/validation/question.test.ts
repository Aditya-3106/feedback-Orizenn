import { describe, expect, it } from "vitest";
import { QUESTION_TYPES } from "@/lib/forms/definitions";
import { isQuestionType, optionInputSchema, questionDraftSchema, reorderSchema } from "@/lib/validation/question";

function issues(input: unknown): Array<{ path: string; message: string }> {
  const r = questionDraftSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

describe("questionDraftSchema (PRD §76, §91, §108)", () => {
  describe("RATING", () => {
    it("valid rating question gets sensible defaults", () => {
      const r = questionDraftSchema.safeParse({ text: "How useful was Orizenn?", type: "RATING" });
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data).toEqual({
        text: "How useful was Orizenn?",
        type: "RATING",
        required: true,
        validation: {},
        analytics: { displayPriority: 100, showInSummary: true },
        options: [],
      });
    });

    it("accepts an explicit 1–5 range and a 1–10 range", () => {
      expect(issues({ text: "Rate it", type: "RATING", validation: { min: 1, max: 5 } })).toEqual([]);
      expect(issues({ text: "Rate it", type: "RATING", validation: { min: 1, max: 10 } })).toEqual([]);
    });

    it("rejects min below 1", () => {
      expect(issues({ text: "Rate it", type: "RATING", validation: { min: 0 } })).toEqual([
        { path: "validation.min", message: "Rating minimum must be at least 1." },
      ]);
    });

    it("rejects max above 10", () => {
      expect(issues({ text: "Rate it", type: "RATING", validation: { max: 11 } })).toEqual([
        { path: "validation.max", message: "Rating maximum must be at most 10." },
      ]);
    });

    it("rejects a non-ascending range", () => {
      expect(issues({ text: "Rate it", type: "RATING", validation: { min: 3, max: 3 } })).toEqual([
        { path: "validation.max", message: "Maximum must be greater than minimum." },
      ]);
    });

    it("coerces numeric strings inside validation", () => {
      const r = questionDraftSchema.safeParse({ text: "Rate it", type: "RATING", validation: { min: "1", max: "5" } });
      expect(r.success && r.data.validation).toEqual({ min: 1, max: 5 });
    });
  });

  describe("choice questions", () => {
    it("valid single choice with two options", () => {
      const r = questionDraftSchema.safeParse({
        text: "Did it help?",
        type: "SINGLE_CHOICE",
        options: [{ label: "Yes" }, { label: "No", value: "no" }],
      });
      expect(r.success).toBe(true);
    });

    it("missing options → 'Choice questions need at least 2 options.'", () => {
      expect(issues({ text: "Did it help?", type: "SINGLE_CHOICE" })).toEqual([
        { path: "options", message: "Choice questions need at least 2 options." },
      ]);
      expect(issues({ text: "Did it help?", type: "DROPDOWN", options: [{ label: "Only one" }] })).toEqual([
        { path: "options", message: "Choice questions need at least 2 options." },
      ]);
      expect(issues({ text: "Pick some", type: "MULTIPLE_CHOICE", options: [] })).toHaveLength(1);
    });

    it("flags duplicate options (case-insensitive, by value or label)", () => {
      const dup = issues({ text: "Pick", type: "SINGLE_CHOICE", options: [{ label: "Yes" }, { label: "yes" }] });
      expect(dup).toEqual([{ path: "options.1", message: "Duplicate option." }]);
      const dupValue = issues({ text: "Pick", type: "SINGLE_CHOICE", options: [{ label: "A", value: "x" }, { label: "B", value: "X" }] });
      expect(dupValue).toEqual([{ path: "options.1", message: "Duplicate option." }]);
    });

    it("rejects blank labels and more than 20 options", () => {
      expect(issues({ text: "Pick", type: "SINGLE_CHOICE", options: [{ label: "  " }, { label: "B" }] })).toEqual([
        { path: "options.0.label", message: "Option label is required." },
      ]);
      const many = Array.from({ length: 21 }, (_, i) => ({ label: `Option ${i}` }));
      expect(issues({ text: "Pick", type: "SINGLE_CHOICE", options: many }).map((i) => i.message)).toContain("At most 20 options.");
    });

    it("option values are restricted to letters, numbers, _ and -", () => {
      expect(optionInputSchema.safeParse({ label: "A", value: "very_useful-1" }).success).toBe(true);
      const r = optionInputSchema.safeParse({ label: "A", value: "bad value!" });
      expect(r.success).toBe(false);
    });

    it("non-choice questions cannot carry options", () => {
      expect(issues({ text: "Rate it", type: "RATING", options: [{ label: "A" }, { label: "B" }] })).toEqual([
        { path: "options", message: "Only choice questions can have options." },
      ]);
    });

    it("MULTIPLE_CHOICE cannot require more selections than options", () => {
      expect(
        issues({ text: "Pick", type: "MULTIPLE_CHOICE", options: [{ label: "A" }, { label: "B" }], validation: { maxSelections: 3 } }),
      ).toEqual([{ path: "validation.maxSelections", message: "Cannot require more selections than options." }]);
    });
  });

  describe("text questions", () => {
    it("valid text lengths", () => {
      expect(issues({ text: "Tell us more", type: "SHORT_TEXT", validation: { maxLength: 300 } })).toEqual([]);
      expect(issues({ text: "Tell us more", type: "LONG_TEXT", validation: { minLength: 10, maxLength: 3000 } })).toEqual([]);
    });

    it("invalid text length: SHORT_TEXT max 500, LONG_TEXT max 3000", () => {
      expect(issues({ text: "Tell us", type: "SHORT_TEXT", validation: { maxLength: 501 } })).toEqual([
        { path: "validation.maxLength", message: "Maximum length can be at most 500." },
      ]);
      expect(issues({ text: "Tell us", type: "LONG_TEXT", validation: { maxLength: 3001 } })).toEqual([
        { path: "validation.maxLength", message: "Maximum length can be at most 3000." },
      ]);
    });

    it("minLength may not exceed maxLength", () => {
      expect(issues({ text: "Tell us", type: "LONG_TEXT", validation: { minLength: 50, maxLength: 20 } })).toEqual([
        { path: "validation.minLength", message: "Minimum length exceeds maximum." },
      ]);
    });

    it("maxLength must be a positive integer", () => {
      expect(issues({ text: "Tell us", type: "SHORT_TEXT", validation: { maxLength: 0 } }).map((i) => i.path)).toEqual(["validation.maxLength"]);
    });
  });

  describe("SCALE and NUMBER", () => {
    it("scale needs at least 3 points and at most 101", () => {
      expect(issues({ text: "Scale", type: "SCALE", validation: { min: 0, max: 1 } })).toEqual([
        { path: "validation.max", message: "A scale needs at least 3 points." },
      ]);
      expect(issues({ text: "Scale", type: "SCALE", validation: { min: 0, max: 101 } })).toEqual([
        { path: "validation.max", message: "A scale can have at most 101 points." },
      ]);
      expect(issues({ text: "Scale", type: "SCALE" })).toEqual([]);
    });

    it("number max must be at least min", () => {
      expect(issues({ text: "Number", type: "NUMBER", validation: { min: 10, max: 5 } })).toEqual([
        { path: "validation.max", message: "Maximum must be at least the minimum." },
      ]);
      expect(issues({ text: "Number", type: "NUMBER", validation: { min: 5, max: 5 } })).toEqual([]);
    });
  });

  describe("general fields", () => {
    it("text must be 3–500 characters", () => {
      expect(issues({ text: "Hi", type: "RATING" })).toEqual([{ path: "text", message: "Question text must be at least 3 characters." }]);
      expect(issues({ text: "x".repeat(501), type: "RATING" }).map((i) => i.path)).toEqual(["text"]);
    });

    it("rejects unknown question types", () => {
      expect(issues({ text: "Emoji?", type: "EMOJI" }).map((i) => i.path)).toEqual(["type"]);
    });

    it("rejects an analytics type that does not apply to the question type", () => {
      expect(issues({ text: "Rate it", type: "RATING", analyticsType: "THEME_CLUSTER" })).toEqual([
        { path: "analyticsType", message: "That analytics type does not apply to RATING questions." },
      ]);
      expect(issues({ text: "Rate it", type: "RATING", analyticsType: "NUMBER_SUMMARY" })).toEqual([]);
      const unknown = issues({ text: "Rate it", type: "RATING", analyticsType: "PIE" });
      expect(unknown.length).toBeGreaterThan(0);
      expect(unknown.every((i) => i.path === "analyticsType")).toBe(true);
    });

    it("comparable key must be lowercase snake_case", () => {
      expect(issues({ text: "Rate it", type: "RATING", comparableKey: "usefulness_v1" })).toEqual([]);
      expect(issues({ text: "Rate it", type: "RATING", comparableKey: "Usefulness" })).toEqual([
        { path: "comparableKey", message: "Use lowercase letters, numbers and underscores." },
      ]);
    });

    it("analytics meta bounds", () => {
      expect(issues({ text: "Rate it", type: "RATING", analytics: { displayPriority: 1001, showInSummary: true } }).map((i) => i.path)).toEqual([
        "analytics.displayPriority",
      ]);
      const r = questionDraftSchema.safeParse({ text: "Rate it", type: "RATING", analytics: { showInSummary: false } });
      expect(r.success && r.data.analytics).toEqual({ displayPriority: 100, showInSummary: false });
    });
  });
});

describe("reorderSchema", () => {
  it("requires a version id and at least one question id", () => {
    expect(reorderSchema.safeParse({ formVersionId: "v1", orderedIds: ["a", "b"] }).success).toBe(true);
    expect(reorderSchema.safeParse({ formVersionId: "v1", orderedIds: [] }).success).toBe(false);
    expect(reorderSchema.safeParse({ formVersionId: "", orderedIds: ["a"] }).success).toBe(false);
  });
});

describe("isQuestionType", () => {
  it("accepts every known type and rejects others", () => {
    for (const t of QUESTION_TYPES) expect(isQuestionType(t)).toBe(true);
    expect(isQuestionType("EMOJI")).toBe(false);
    expect(isQuestionType(42)).toBe(false);
    expect(isQuestionType(undefined)).toBe(false);
  });
});
