import { describe, expect, it } from "vitest";
import { compareVersions } from "@/lib/forms/compare";
import { makeOptions, makeQuestion } from "../fixtures";

describe("compareVersions (PRD §39, §131)", () => {
  it("matches by comparableKey first: a wording change with the same key is 'changed' and still comparable", () => {
    const before = makeQuestion({ key: "q_old_wording", text: "How useful was it?", comparableKey: "usefulness" });
    const after = makeQuestion({ key: "q_new_wording", text: "How useful was the Orizenn analysis?", comparableKey: "usefulness" });
    const diff = compareVersions([before], [after]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
    expect(diff.changed).toEqual([{ before, after, fields: ["text"] }]);
    expect(diff.comparable).toEqual([{ key: "usefulness", before, after }]);
  });

  it("falls back to the stable question key when there is no comparable key", () => {
    const before = makeQuestion({ key: "q_same", text: "Same text" });
    const after = { ...before, id: "other-id", required: false };
    const diff = compareVersions([before], [after]);
    expect(diff.changed).toEqual([{ before, after, fields: ["required"] }]);
    // Only explicit comparable keys count for metric comparison.
    expect(diff.comparable).toEqual([]);
  });

  it("identical questions are unchanged", () => {
    const q = makeQuestion({ key: "q_same", comparableKey: "ck" });
    const copy = { ...q, id: "fresh-id" };
    const diff = compareVersions([q], [copy]);
    expect(diff.unchanged).toEqual([{ before: q, after: copy }]);
    expect(diff.changed).toEqual([]);
    expect(diff.comparable).toEqual([{ key: "ck", before: q, after: copy }]);
  });

  it("different keys with no comparable key → added / removed", () => {
    const gone = makeQuestion({ key: "q_gone" });
    const kept = makeQuestion({ key: "q_kept" });
    const fresh = makeQuestion({ key: "q_fresh" });
    const diff = compareVersions([gone, kept], [kept, fresh]);
    expect(diff.removed).toEqual([gone]);
    expect(diff.added).toEqual([fresh]);
    expect(diff.unchanged).toHaveLength(1);
  });

  it("a type change breaks comparability even with the same comparable key", () => {
    const before = makeQuestion({ type: "RATING", key: "q_x", comparableKey: "score" });
    const after = makeQuestion({ type: "SCALE", key: "q_x", comparableKey: "score" });
    const diff = compareVersions([before], [after]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].fields).toEqual(expect.arrayContaining(["type", "analyticsType"]));
    expect(diff.comparable).toEqual([]);
  });

  it("adding a comparable key later is treated as a new identity", () => {
    const before = makeQuestion({ key: "q_x", comparableKey: null });
    const after = makeQuestion({ key: "q_x", comparableKey: "now_comparable" });
    const diff = compareVersions([before], [after]);
    expect(diff.removed).toEqual([before]);
    expect(diff.added).toEqual([after]);
  });

  it("reports every changed field, including options, validation, category and description", () => {
    const before = makeQuestion({
      type: "SINGLE_CHOICE",
      key: "q_c",
      comparableKey: "choice",
      options: makeOptions(["Yes", "No"]),
      category: "Value",
      description: null,
      validation: {},
    });
    const after = {
      ...before,
      options: makeOptions(["Yes", "No", "Not sure"]),
      category: "Discovery",
      description: "Now with help text",
      validation: { minSelections: 1 },
    };
    const diff = compareVersions([before], [after]);
    expect(diff.changed[0].fields).toEqual(["description", "category", "options", "validation"]);
    expect(diff.comparable).toHaveLength(1);
  });

  it("empty inputs", () => {
    expect(compareVersions([], [])).toEqual({ added: [], removed: [], changed: [], unchanged: [], comparable: [] });
    const q = makeQuestion({ key: "q_only" });
    expect(compareVersions([], [q]).added).toEqual([q]);
    expect(compareVersions([q], []).removed).toEqual([q]);
  });
});
