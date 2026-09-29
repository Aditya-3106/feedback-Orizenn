import { describe, expect, it } from "vitest";
import type { AnalyticsType, QuestionType } from "@/lib/forms/definitions";
import { checkPublishable } from "@/lib/forms/publish-check";
import { makeForm, makeOptions, makeQuestion } from "../fixtures";

const messages = (form: ReturnType<typeof makeForm>) => checkPublishable(form).map((i) => i.message);

describe("checkPublishable (PRD §24, §77)", () => {
  it("a valid form has no issues", () => {
    const form = makeForm([
      makeQuestion({ type: "RATING", key: "q_a", position: 0, comparableKey: "a" }),
      makeQuestion({ type: "SINGLE_CHOICE", key: "q_b", position: 1, options: makeOptions(["Yes", "No"]), comparableKey: "b" }),
      makeQuestion({ type: "LONG_TEXT", key: "q_c", position: 2 }),
      makeQuestion({ type: "SCALE", key: "q_d", position: 3 }),
    ]);
    expect(checkPublishable(form)).toEqual([]);
  });

  it("no questions", () => {
    expect(checkPublishable(makeForm([]))).toEqual([{ message: "Add at least one question before publishing." }]);
  });

  it("campaign needs a name", () => {
    const form = makeForm([makeQuestion()], { campaign: { name: "   " } });
    expect(messages(form)).toContain("Campaign needs a name.");
  });

  it("duplicate keys", () => {
    const form = makeForm([makeQuestion({ key: "q_dup", position: 0 }), makeQuestion({ key: "q_dup", position: 1 })]);
    const issues = checkPublishable(form);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('Question 2: duplicate question key "q_dup".');
    expect(issues[0].questionId).toBe(form.questions[1].id);
  });

  it("duplicate positions", () => {
    const form = makeForm([makeQuestion({ key: "q_a", position: 0 }), makeQuestion({ key: "q_b", position: 0 })]);
    expect(messages(form)).toEqual(["Question 2: duplicate position 0."]);
  });

  it("choice without enough options", () => {
    const form = makeForm([
      makeQuestion({ type: "SINGLE_CHOICE", key: "q_a", position: 0, options: [] }),
      makeQuestion({ type: "DROPDOWN", key: "q_b", position: 1, options: makeOptions(["Only"]) }),
      makeQuestion({ type: "MULTIPLE_CHOICE", key: "q_c", position: 2, options: makeOptions(["A", "B"]) }),
    ]);
    expect(messages(form)).toEqual([
      "Question 1: choice questions need at least 2 options.",
      "Question 2: choice questions need at least 2 options.",
    ]);
  });

  it("duplicate option values and blank labels", () => {
    const form = makeForm([
      makeQuestion({
        type: "SINGLE_CHOICE",
        key: "q_a",
        options: [
          { id: "1", label: "Yes", value: "yes", position: 0 },
          { id: "2", label: "  ", value: "yes", position: 1 },
        ],
      }),
    ]);
    expect(messages(form)).toEqual(['Question 1: duplicate option value "yes".', "Question 1: an option has no label."]);
  });

  it("invalid analytics type for the question type", () => {
    const form = makeForm([
      makeQuestion({ type: "RATING", key: "q_a", position: 0, analyticsType: "THEME_CLUSTER" }),
      makeQuestion({ type: "YES_NO", key: "q_b", position: 1, analyticsType: "RATING_DISTRIBUTION" }),
      makeQuestion({ type: "RATING", key: "q_c", position: 2, analyticsType: "NUMBER_SUMMARY" }),
    ]);
    expect(messages(form)).toEqual([
      'Question 1: analytics type "THEME_CLUSTER" does not apply to RATING.',
      'Question 2: analytics type "RATING_DISTRIBUTION" does not apply to YES_NO.',
    ]);
  });

  it("unknown analytics / question types coming from bad data", () => {
    const form = makeForm([
      makeQuestion({ key: "q_a", position: 0, analyticsType: "PIE" as AnalyticsType }),
      makeQuestion({ key: "q_b", position: 1, type: "EMOJI" as QuestionType }),
    ]);
    const msgs = messages(form);
    expect(msgs).toContain("Question 1: invalid analytics type.");
    expect(msgs).toContain('Question 2: unsupported question type "EMOJI".');
  });

  it("duplicate comparable keys across the version", () => {
    const form = makeForm([
      makeQuestion({ key: "q_a", position: 0, comparableKey: "same" }),
      makeQuestion({ key: "q_b", position: 1, comparableKey: "same" }),
      makeQuestion({ key: "q_c", position: 2, comparableKey: "other" }),
    ]);
    expect(checkPublishable(form)).toEqual([{ message: 'Comparable key "same" is used by 2 questions in this version.' }]);
  });

  it("comparable key characters", () => {
    const form = makeForm([makeQuestion({ key: "q_a", comparableKey: "Bad-Key" })]);
    expect(messages(form)).toEqual(["Question 1: comparable key may only contain a–z, 0–9 and _."]);
  });

  it("bad rating range", () => {
    const bad = (validation: { min?: number; max?: number }) =>
      messages(makeForm([makeQuestion({ type: "RATING", key: "q_a", validation })]));
    expect(bad({ min: 0, max: 5 })).toContain("Question 1: rating range must be within 1–10 and ascending.");
    expect(bad({ min: 1, max: 11 })).toContain("Question 1: rating range must be within 1–10 and ascending.");
    expect(bad({ min: 4, max: 4 })).toContain("Question 1: rating range must be within 1–10 and ascending.");
    expect(bad({ min: 1, max: 10 })).toEqual([]);
    expect(bad({})).toEqual([]);
  });

  it("scale needs at least 3 points", () => {
    expect(messages(makeForm([makeQuestion({ type: "SCALE", key: "q_a", validation: { min: 0, max: 1 } })]))).toEqual([
      "Question 1: scale needs at least 3 points.",
    ]);
  });

  it("text and numeric bounds must be ordered", () => {
    expect(messages(makeForm([makeQuestion({ type: "LONG_TEXT", key: "q_a", validation: { minLength: 50, maxLength: 10 } })]))).toEqual([
      "Question 1: minimum length exceeds maximum length.",
    ]);
    expect(messages(makeForm([makeQuestion({ type: "NUMBER", key: "q_a", validation: { min: 10, max: 1 } })]))).toEqual([
      "Question 1: minimum exceeds maximum.",
    ]);
  });

  it("question text too short", () => {
    expect(messages(makeForm([makeQuestion({ key: "q_a", text: "Hi" })]))).toEqual(["Question 1: question text is too short."]);
  });

  it("attaches questionId to per-question issues", () => {
    const q = makeQuestion({ type: "SINGLE_CHOICE", key: "q_a", options: [] });
    const issues = checkPublishable(makeForm([q]));
    expect(issues.every((i) => i.questionId === q.id)).toBe(true);
  });
});
