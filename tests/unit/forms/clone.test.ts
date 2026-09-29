import { describe, expect, it } from "vitest";
import {
  cloneQuestionsData,
  definitionToDraft,
  optionValueFromLabel,
  questionDraftToCreateData,
  questionDraftToUpdateData,
} from "@/lib/forms/clone";
import { questionDraftSchema } from "@/lib/validation/question";
import { deepFreeze, makeOptions, makeQuestion } from "../fixtures";

describe("cloneQuestionsData (PRD §14, §52, §108 form cloning)", () => {
  function source() {
    const second = makeQuestion({
      type: "SINGLE_CHOICE",
      key: "q_second",
      position: 1,
      text: "Second question",
      options: [
        { id: "o2", label: "No", value: "no", position: 1 },
        { id: "o1", label: "Yes", value: "yes", position: 0 },
      ],
      validation: {},
    });
    const first = makeQuestion({
      type: "RATING",
      key: "q_first",
      position: 0,
      text: "First question",
      description: "Some help text",
      category: "Value",
      comparableKey: "first_ck",
      required: false,
      validation: { min: 1, max: 5 },
      analytics: { displayPriority: 10, showInSummary: false },
    });
    // Out of position order on purpose.
    return deepFreeze([second, first]);
  }

  it("produces create payloads with the same keys, positions and options — and fresh ids", () => {
    const data = cloneQuestionsData(source());
    expect(data.map((d) => d.key)).toEqual(["q_first", "q_second"]);
    expect(data.map((d) => d.position)).toEqual([0, 1]);
    expect(data[0]).not.toHaveProperty("id");
    expect(data[0]).toMatchObject({
      text: "First question",
      description: "Some help text",
      type: "RATING",
      required: false,
      category: "Value",
      analyticsType: "RATING_DISTRIBUTION",
      comparableKey: "first_ck",
      validationJson: { min: 1, max: 5 },
      analyticsJson: { displayPriority: 10, showInSummary: false },
    });
    expect(data[0].options).toBeUndefined();
    expect(data[1].options).toEqual({
      create: [
        { label: "Yes", value: "yes", position: 0 },
        { label: "No", value: "no", position: 1 },
      ],
    });
    // Option payloads carry no ids either.
    expect(data[1].options?.create[0]).not.toHaveProperty("id");
  });

  it("leaves the original untouched (deep-frozen input, identical snapshot)", () => {
    const src = source();
    const before = JSON.stringify(src);
    cloneQuestionsData(src);
    expect(JSON.stringify(src)).toBe(before);
    expect(src[0].position).toBe(1);
    expect(src[0].options[0].position).toBe(1);
  });

  it("maps null description / category and empty validation to undefined", () => {
    const q = makeQuestion({ type: "YES_NO", description: null, category: null, validation: {} });
    const [d] = cloneQuestionsData([q]);
    expect(d.description).toBeUndefined();
    expect(d.category).toBeUndefined();
    expect(d.comparableKey).toBeUndefined();
    expect(d.validationJson).toBeUndefined();
    expect(d.analyticsJson).toEqual({ displayPriority: 100, showInSummary: true });
  });

  it("returns [] for no questions", () => {
    expect(cloneQuestionsData([])).toEqual([]);
  });
});

describe("optionValueFromLabel", () => {
  it("derives a snake_case value and avoids collisions", () => {
    const taken = new Set<string>();
    expect(optionValueFromLabel("Very useful", taken)).toBe("very_useful");
    expect(optionValueFromLabel("Very Useful!", taken)).toBe("very_useful_2");
    expect(optionValueFromLabel("very useful", taken)).toBe("very_useful_3");
    expect(taken).toEqual(new Set(["very_useful", "very_useful_2", "very_useful_3"]));
  });

  it("always yields a non-empty, unique value for symbol-only labels", () => {
    // Note: slugify() already falls back to "form", so the `|| "option"` fallback
    // in optionValueFromLabel is unreachable; the value is "form" today.
    const taken = new Set<string>();
    const a = optionValueFromLabel("???", taken);
    const b = optionValueFromLabel("!!!", taken);
    expect(a).toMatch(/^[a-z0-9_]+$/);
    expect(b).toMatch(/^[a-z0-9_]+$/);
    expect(a).not.toBe(b);
  });
});

describe("questionDraftToCreateData", () => {
  it("derives a stable key, option values and analytics defaults", () => {
    const draft = questionDraftSchema.parse({
      text: "How useful was Orizenn?",
      type: "SINGLE_CHOICE",
      options: [{ label: "Very useful" }, { label: "Not useful", value: "NO" }],
    });
    const data = questionDraftToCreateData(draft, 3);
    expect(data.key).toBe("q_how_useful_was_orizenn");
    expect(data.position).toBe(3);
    expect(data.analyticsType).toBe("OPTION_DISTRIBUTION");
    expect(data.options).toEqual({
      create: [
        { label: "Very useful", value: "very_useful", position: 0 },
        { label: "Not useful", value: "no", position: 1 },
      ],
    });
    expect(data.validationJson).toBeUndefined();
    expect(data.analyticsJson).toEqual({ displayPriority: 100, showInSummary: true });
  });

  it("de-duplicates the key against existing keys", () => {
    const draft = questionDraftSchema.parse({ text: "How useful was Orizenn?", type: "RATING" });
    expect(questionDraftToCreateData(draft, 0, ["q_how_useful_was_orizenn"]).key).toBe("q_how_useful_was_orizenn_2");
    expect(questionDraftToCreateData(draft, 0, ["q_how_useful_was_orizenn", "q_how_useful_was_orizenn_2"]).key).toBe("q_how_useful_was_orizenn_3");
  });

  it("merges type defaults into validation", () => {
    const rating = questionDraftSchema.parse({ text: "Rate it", type: "RATING" });
    expect(questionDraftToCreateData(rating, 0).validationJson).toEqual({ min: 1, max: 5 });
    const custom = questionDraftSchema.parse({ text: "Rate it", type: "RATING", validation: { max: 7 } });
    expect(questionDraftToCreateData(custom, 0).validationJson).toEqual({ min: 1, max: 7 });
    const text = questionDraftSchema.parse({ text: "Tell us", type: "LONG_TEXT" });
    expect(questionDraftToCreateData(text, 0).validationJson).toEqual({ maxLength: 3000 });
    expect(questionDraftToCreateData(text, 0).options).toBeUndefined();
  });

  it("keeps an explicit analytics type and comparable key", () => {
    const draft = questionDraftSchema.parse({ text: "Rate it", type: "RATING", analyticsType: "NUMBER_SUMMARY", comparableKey: "rate_it" });
    const data = questionDraftToCreateData(draft, 0);
    expect(data.analyticsType).toBe("NUMBER_SUMMARY");
    expect(data.comparableKey).toBe("rate_it");
  });
});

describe("questionDraftToUpdateData", () => {
  it("nulls out cleared optionals and merges validation defaults", () => {
    const draft = questionDraftSchema.parse({ text: "Rate it", type: "RATING", validation: { max: 10 } });
    expect(questionDraftToUpdateData(draft)).toEqual({
      text: "Rate it",
      description: null,
      type: "RATING",
      required: true,
      category: null,
      analyticsType: "RATING_DISTRIBUTION",
      comparableKey: null,
      validationJson: { min: 1, max: 10 },
      analyticsJson: { displayPriority: 100, showInSummary: true },
    });
  });
});

describe("definitionToDraft", () => {
  it("round-trips a stored definition through the draft schema", () => {
    const q = makeQuestion({
      type: "MULTIPLE_CHOICE",
      text: "What did you change?",
      key: "q_what_did_you_change",
      description: "Pick all that apply",
      category: "Improvement",
      comparableKey: "changes_made",
      required: false,
      validation: { minSelections: 1, maxSelections: 2 },
      options: makeOptions(["Testing", "Docs"]),
    });
    const draft = definitionToDraft(q);
    const parsed = questionDraftSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const data = questionDraftToCreateData(parsed.data, q.position);
    expect(data.key).toBe(q.key);
    expect(data.text).toBe(q.text);
    expect(data.comparableKey).toBe("changes_made");
    expect(data.options?.create.map((o) => o.value)).toEqual(["testing", "docs"]);
    expect(data.validationJson).toEqual({ minSelections: 1, maxSelections: 2 });
  });
});
