import { describe, expect, it } from "vitest";
import {
  ANALYTICS_TYPES,
  ANALYTICS_TYPE_LABELS,
  DEFAULT_ANALYTICS_META,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  RESPONDENT_FIELDS,
  RESPONDENT_FIELD_LABELS,
  allowedAnalyticsTypes,
  defaultAnalyticsType,
  defaultValidation,
  describeAnswer,
  estimateMinutes,
  isChoiceType,
  isNumericType,
  isTextType,
} from "@/lib/forms/definitions";
import { makeOptions, makeQuestion } from "../fixtures";

describe("defaultAnalyticsType (PRD §37)", () => {
  it.each([
    ["RATING", "RATING_DISTRIBUTION"],
    ["SCALE", "SCALE_DISTRIBUTION"],
    ["SINGLE_CHOICE", "OPTION_DISTRIBUTION"],
    ["MULTIPLE_CHOICE", "MULTI_SELECT_FREQUENCY"],
    ["YES_NO", "YES_NO_DISTRIBUTION"],
    ["NUMBER", "NUMBER_SUMMARY"],
    ["SHORT_TEXT", "TEXT_RESPONSES"],
    ["LONG_TEXT", "THEME_CLUSTER"],
    ["DROPDOWN", "SEGMENT_DISTRIBUTION"],
  ] as const)("%s → %s", (type, analytics) => {
    expect(defaultAnalyticsType(type)).toBe(analytics);
  });
});

describe("allowedAnalyticsTypes", () => {
  it("always includes the default and only known analytics types", () => {
    for (const type of QUESTION_TYPES) {
      const allowed = allowedAnalyticsTypes(type);
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed).toContain(defaultAnalyticsType(type));
      for (const a of allowed) expect(ANALYTICS_TYPES).toContain(a);
    }
  });

  it("numeric questions may fall back to a number summary; text may swap list/themes", () => {
    expect(allowedAnalyticsTypes("RATING")).toEqual(["RATING_DISTRIBUTION", "NUMBER_SUMMARY"]);
    expect(allowedAnalyticsTypes("LONG_TEXT")).toEqual(["THEME_CLUSTER", "TEXT_RESPONSES"]);
    expect(allowedAnalyticsTypes("YES_NO")).toEqual(["YES_NO_DISTRIBUTION"]);
    expect(allowedAnalyticsTypes("RATING")).not.toContain("THEME_CLUSTER");
  });
});

describe("type predicates and defaults", () => {
  it("classify types", () => {
    expect(QUESTION_TYPES.filter(isChoiceType)).toEqual(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN"]);
    expect(QUESTION_TYPES.filter(isNumericType)).toEqual(["RATING", "SCALE", "NUMBER"]);
    expect(QUESTION_TYPES.filter(isTextType)).toEqual(["SHORT_TEXT", "LONG_TEXT"]);
    expect(QUESTION_TYPES.filter((t) => !isChoiceType(t) && !isNumericType(t) && !isTextType(t))).toEqual(["YES_NO"]);
  });

  it("defaultValidation per type", () => {
    expect(defaultValidation("RATING")).toEqual({ min: 1, max: 5 });
    expect(defaultValidation("SCALE")).toEqual({ min: 0, max: 10 });
    expect(defaultValidation("SHORT_TEXT")).toEqual({ maxLength: 300 });
    expect(defaultValidation("LONG_TEXT")).toEqual({ maxLength: 3000 });
    expect(defaultValidation("MULTIPLE_CHOICE")).toEqual({ minSelections: 1 });
    expect(defaultValidation("YES_NO")).toEqual({});
    expect(defaultValidation("NUMBER")).toEqual({});
  });

  it("DEFAULT_ANALYTICS_META", () => {
    expect(DEFAULT_ANALYTICS_META).toEqual({ displayPriority: 100, showInSummary: true });
  });

  it("every enum value has a label", () => {
    for (const t of QUESTION_TYPES) expect(QUESTION_TYPE_LABELS[t]).toBeTruthy();
    for (const a of ANALYTICS_TYPES) expect(ANALYTICS_TYPE_LABELS[a]).toBeTruthy();
    for (const f of RESPONDENT_FIELDS) expect(RESPONDENT_FIELD_LABELS[f]).toBeTruthy();
  });
});

describe("estimateMinutes (PRD §20, §24)", () => {
  it("never estimates less than one minute", () => {
    expect(estimateMinutes([])).toBe(1);
    expect(estimateMinutes([{ type: "RATING" }])).toBe(1);
  });

  it("weights long text (60s), short text (30s), multiple choice (20s) and everything else (12s)", () => {
    expect(estimateMinutes([{ type: "LONG_TEXT" }, { type: "LONG_TEXT" }, { type: "LONG_TEXT" }])).toBe(3);
    // 3×60 + 20 = 200s → 3.33 → 3
    expect(estimateMinutes([{ type: "LONG_TEXT" }, { type: "LONG_TEXT" }, { type: "LONG_TEXT" }, { type: "MULTIPLE_CHOICE" }])).toBe(3);
    // 5×12 + 2×30 = 120s → 2
    expect(estimateMinutes([...Array(5).fill({ type: "RATING" }), { type: "SHORT_TEXT" }, { type: "SHORT_TEXT" }])).toBe(2);
    // 8×12 = 96s → 1.6 → 2
    expect(estimateMinutes(Array(8).fill({ type: "YES_NO" }))).toBe(2);
  });
});

describe("describeAnswer (PRD §61)", () => {
  const choice = makeQuestion({ type: "MULTIPLE_CHOICE", options: makeOptions(["Label A", "Label B", "Label C"]) });

  it("renders every answer kind", () => {
    expect(describeAnswer(choice, null)).toBe("");
    expect(describeAnswer(makeQuestion({ type: "YES_NO" }), { kind: "boolean", value: true })).toBe("Yes");
    expect(describeAnswer(makeQuestion({ type: "YES_NO" }), { kind: "boolean", value: false })).toBe("No");
    expect(describeAnswer(makeQuestion({ type: "RATING" }), { kind: "number", value: 4 })).toBe("4");
    expect(describeAnswer(makeQuestion({ type: "SHORT_TEXT" }), { kind: "text", value: "free text" })).toBe("free text");
  });

  it("maps option values to labels, falling back to the raw value", () => {
    expect(describeAnswer(choice, { kind: "text", value: "label_b" })).toBe("Label B");
    expect(describeAnswer(choice, { kind: "json", value: ["label_a", "label_b"] })).toBe("Label A, Label B");
    expect(describeAnswer(choice, { kind: "json", value: ["label_c", "legacy"] })).toBe("Label C, legacy");
    expect(describeAnswer(choice, { kind: "json", value: [] })).toBe("");
  });
});
