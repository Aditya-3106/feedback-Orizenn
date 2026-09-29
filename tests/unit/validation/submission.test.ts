import { describe, expect, it } from "vitest";
import {
  submissionPayloadSchema,
  validateAnswer,
  validateAnswers,
  validateRespondentContext,
} from "@/lib/validation/submission";
import { makeForm, makeOptions, makeQuestion } from "../fixtures";

describe("submissionPayloadSchema (PRD §78)", () => {
  it("accepts a minimal payload and applies defaults", () => {
    const r = submissionPayloadSchema.safeParse({ clientToken: "abcdefgh" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({ clientToken: "abcdefgh", website: "", respondent: {}, answers: {} });
  });

  it("requires a client token of 8–64 characters", () => {
    expect(submissionPayloadSchema.safeParse({ clientToken: "short" }).success).toBe(false);
    expect(submissionPayloadSchema.safeParse({ clientToken: "x".repeat(65) }).success).toBe(false);
    expect(submissionPayloadSchema.safeParse({}).success).toBe(false);
  });

  it("honeypot field passes through the schema so the service can silently discard bot submissions", () => {
    const r = submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", website: "http://spam" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.website).toBe("http://spam");
    expect(submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", website: "x".repeat(501) }).success).toBe(false);
  });

  it("validates respondent email but tolerates an empty string", () => {
    expect(submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", respondent: { email: "nope" } }).success).toBe(false);
    expect(submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", respondent: { email: "" } }).success).toBe(true);
    expect(submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", respondent: { email: "a@b.co" } }).success).toBe(true);
  });

  it("startedAt must be an ISO datetime", () => {
    expect(submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", startedAt: "2026-09-29T10:00:00Z" }).success).toBe(true);
    expect(submissionPayloadSchema.safeParse({ clientToken: "abcdefgh", startedAt: "yesterday" }).success).toBe(false);
  });
});

describe("validateAnswer (PRD §78–79)", () => {
  describe("RATING", () => {
    const q = makeQuestion({ type: "RATING" });

    it("accepts integers within 1–5 (numbers or numeric strings)", () => {
      expect(validateAnswer(q, 4)).toEqual({ value: { kind: "number", value: 4 } });
      expect(validateAnswer(q, "5")).toEqual({ value: { kind: "number", value: 5 } });
    });

    it("rejects a non-numeric string", () => {
      expect(validateAnswer(q, "great")).toEqual({ error: "Enter a number." });
    });

    it("rejects out-of-range ratings", () => {
      expect(validateAnswer(q, 6)).toEqual({ error: "Must be at most 5." });
      expect(validateAnswer(q, 0)).toEqual({ error: "Must be at least 1." });
    });

    it("rejects fractional ratings", () => {
      expect(validateAnswer(q, 3.5)).toEqual({ error: "Choose one of the options." });
    });

    it("honours a custom range", () => {
      const wide = makeQuestion({ type: "RATING", validation: { min: 1, max: 10 } });
      expect(validateAnswer(wide, 10).value).toEqual({ kind: "number", value: 10 });
      expect(validateAnswer(wide, 11).error).toBe("Must be at most 10.");
    });
  });

  describe("SCALE and NUMBER", () => {
    it("scale defaults to 0–10", () => {
      const q = makeQuestion({ type: "SCALE" });
      expect(validateAnswer(q, 0).value).toEqual({ kind: "number", value: 0 });
      expect(validateAnswer(q, 10).value).toEqual({ kind: "number", value: 10 });
      expect(validateAnswer(q, 11).error).toBe("Must be at most 10.");
    });

    it("number accepts decimals and applies optional bounds", () => {
      const q = makeQuestion({ type: "NUMBER", validation: {} });
      expect(validateAnswer(q, 3.5).value).toEqual({ kind: "number", value: 3.5 });
      expect(validateAnswer(q, "-2").value).toEqual({ kind: "number", value: -2 });
      const bounded = makeQuestion({ type: "NUMBER", validation: { min: 0, max: 100 } });
      expect(validateAnswer(bounded, 101).error).toBe("Must be at most 100.");
      expect(validateAnswer(bounded, -1).error).toBe("Must be at least 0.");
      expect(validateAnswer(bounded, "NaN").error).toBe("Enter a number.");
    });
  });

  describe("YES_NO", () => {
    const q = makeQuestion({ type: "YES_NO" });

    it("accepts booleans and yes/no/true/false strings", () => {
      expect(validateAnswer(q, true)).toEqual({ value: { kind: "boolean", value: true } });
      expect(validateAnswer(q, false)).toEqual({ value: { kind: "boolean", value: false } });
      expect(validateAnswer(q, "yes")).toEqual({ value: { kind: "boolean", value: true } });
      expect(validateAnswer(q, " No ")).toEqual({ value: { kind: "boolean", value: false } });
      expect(validateAnswer(q, "TRUE")).toEqual({ value: { kind: "boolean", value: true } });
    });

    it("rejects anything else", () => {
      expect(validateAnswer(q, "maybe")).toEqual({ error: "Choose yes or no." });
      expect(validateAnswer(q, 1)).toEqual({ error: "Choose yes or no." });
    });
  });

  describe("SINGLE_CHOICE / DROPDOWN", () => {
    const q = makeQuestion({ type: "SINGLE_CHOICE", options: makeOptions(["Yes", "No", "Not sure"]) });

    it("accepts a known option value", () => {
      expect(validateAnswer(q, "not_sure")).toEqual({ value: { kind: "text", value: "not_sure" } });
      expect(validateAnswer(q, " yes ")).toEqual({ value: { kind: "text", value: "yes" } });
    });

    it("rejects an option that is not on the question (labels are not values)", () => {
      expect(validateAnswer(q, "Yes")).toEqual({ error: "Choose one of the options." });
      expect(validateAnswer(q, "banana")).toEqual({ error: "Choose one of the options." });
    });

    it("dropdown behaves the same", () => {
      const dd = makeQuestion({ type: "DROPDOWN", options: makeOptions(["CSE", "ECE"]) });
      expect(validateAnswer(dd, "ece").value).toEqual({ kind: "text", value: "ece" });
      expect(validateAnswer(dd, "MECH").error).toBeDefined();
    });
  });

  describe("MULTIPLE_CHOICE", () => {
    const q = makeQuestion({ type: "MULTIPLE_CHOICE", options: makeOptions(["Testing", "Validation", "Docs"]) });

    it("orders the result by option position and dedupes", () => {
      expect(validateAnswer(q, ["docs", "testing", "docs", "testing"])).toEqual({ value: { kind: "json", value: ["testing", "docs"] } });
    });

    it("accepts a single string as a one-element selection", () => {
      expect(validateAnswer(q, "validation")).toEqual({ value: { kind: "json", value: ["validation"] } });
    });

    it("rejects invalid values", () => {
      expect(validateAnswer(q, ["testing", "bogus"])).toEqual({ error: "One of the selected options is invalid." });
    });

    it("enforces minSelections / maxSelections", () => {
      const limited = makeQuestion({ type: "MULTIPLE_CHOICE", options: q.options, validation: { minSelections: 2, maxSelections: 2 } });
      expect(validateAnswer(limited, ["docs"]).error).toBe("Select at least 2.");
      expect(validateAnswer(limited, ["docs", "testing", "validation"]).error).toBe("Select at most 2.");
      expect(validateAnswer(limited, ["docs", "testing"]).value).toEqual({ kind: "json", value: ["testing", "docs"] });
    });

    it("required multi-choice needs at least one selection; optional may be empty", () => {
      expect(validateAnswer(q, []).error).toBe("This question is required.");
      const optional = makeQuestion({ type: "MULTIPLE_CHOICE", options: q.options, required: false, validation: {} });
      expect(validateAnswer(optional, [])).toEqual({});
    });
  });

  describe("text", () => {
    it("trims, normalises line endings and caps length", () => {
      const q = makeQuestion({ type: "SHORT_TEXT" });
      expect(validateAnswer(q, "  hello\r\nworld  ")).toEqual({ value: { kind: "text", value: "hello\nworld" } });
      expect(validateAnswer(q, "x".repeat(300)).value).toBeDefined();
      expect(validateAnswer(q, "x".repeat(301)).error).toBe("Please keep it under 300 characters.");
    });

    it("LONG_TEXT defaults to 3000 and honours custom min/max", () => {
      const q = makeQuestion({ type: "LONG_TEXT" });
      expect(validateAnswer(q, "x".repeat(3001)).error).toBe("Please keep it under 3000 characters.");
      const custom = makeQuestion({ type: "LONG_TEXT", validation: { minLength: 5, maxLength: 10 } });
      expect(validateAnswer(custom, "abc").error).toBe("Please write at least 5 characters.");
      expect(validateAnswer(custom, "abcdefghijk").error).toBe("Please keep it under 10 characters.");
      expect(validateAnswer(custom, "abcdef").value).toEqual({ kind: "text", value: "abcdef" });
    });

    it("coerces non-string input to text", () => {
      const q = makeQuestion({ type: "SHORT_TEXT" });
      expect(validateAnswer(q, 42)).toEqual({ value: { kind: "text", value: "42" } });
    });
  });

  describe("required / optional", () => {
    it("required questions reject blank input in every shape", () => {
      const q = makeQuestion({ type: "SHORT_TEXT" });
      for (const blank of [undefined, null, "", "   ", []]) {
        expect(validateAnswer(q, blank)).toEqual({ error: "This question is required." });
      }
    });

    it("optional questions accept blank input with no value", () => {
      const q = makeQuestion({ type: "RATING", required: false });
      expect(validateAnswer(q, undefined)).toEqual({});
      expect(validateAnswer(q, "")).toEqual({});
      expect(validateAnswer(q, null)).toEqual({});
    });
  });
});

describe("validateAnswers (PRD §79 tampering guard)", () => {
  const rating = makeQuestion({ type: "RATING", id: "q_rating" });
  const choice = makeQuestion({ type: "SINGLE_CHOICE", id: "q_choice", options: makeOptions(["Yes", "No"]) });
  const text = makeQuestion({ type: "LONG_TEXT", id: "q_text", required: false });
  const form = makeForm([rating, choice, text]);

  it("accepts a valid full submission and skips blank optional answers", () => {
    const r = validateAnswers(form, { q_rating: 4, q_choice: "yes", q_text: "" });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
    expect(r.answers).toEqual([
      { questionId: "q_rating", value: { kind: "number", value: 4 } },
      { questionId: "q_choice", value: { kind: "text", value: "yes" } },
    ]);
  });

  it("rejects unknown question ids", () => {
    const r = validateAnswers(form, { q_rating: 4, q_choice: "yes", q_bogus: "x" });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual({ "answers.q_bogus": ["Unknown question."] });
  });

  it("collects every field error keyed by question id", () => {
    const r = validateAnswers(form, { q_rating: "lots", q_choice: "banana" });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual({
      "answers.q_rating": ["Enter a number."],
      "answers.q_choice": ["Choose one of the options."],
    });
    expect(r.answers).toEqual([]);
  });

  it("enforces required questions that are simply missing", () => {
    const r = validateAnswers(form, {});
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(["answers.q_choice", "answers.q_rating"]);
  });
});

describe("validateRespondentContext (PRD §31, §84)", () => {
  it("requires configured fields except email and projectType", () => {
    const form = makeForm([], { campaign: { responseMode: "IDENTIFIED", respondentFields: ["name", "email", "college", "projectType"] } });
    expect(validateRespondentContext(form, {})).toEqual({
      "respondent.name": ["This field is required."],
      "respondent.college": ["This field is required."],
    });
    expect(validateRespondentContext(form, { name: "Asha", college: "IIT", email: "" })).toEqual({});
  });

  it("treats whitespace as blank", () => {
    const form = makeForm([], { campaign: { respondentFields: ["year"] } });
    expect(validateRespondentContext(form, { year: "   " })).toEqual({ "respondent.year": ["This field is required."] });
  });

  it("anonymous campaigns never require identity, even when fields are configured", () => {
    const form = makeForm([], { campaign: { responseMode: "ANONYMOUS", respondentFields: ["name", "college"] } });
    expect(validateRespondentContext(form, {})).toEqual({});
  });
});
