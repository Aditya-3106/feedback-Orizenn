import { describe, expect, it } from "vitest";
import { analyzeQuestion, buildDashboard, headlineFor } from "@/lib/analytics/engine";
import type { QuestionAnswerData, RatingDistributionBlock, YesNoBlock } from "@/lib/analytics/types";
import type { QuestionDefinition } from "@/lib/forms/definitions";
import { makeAnalyticsInput, makeQuestion, makeTotals, ratingAnswers } from "../fixtures";

function fixture() {
  const qRating = makeQuestion({ type: "RATING", text: "How useful was Orizenn?", position: 0, category: "Value", comparableKey: "usefulness" });
  const qYesNo = makeQuestion({ type: "YES_NO", text: "Did you change your project afterwards?", position: 1, category: "Behavior", comparableKey: "changed_project" });
  const qText = makeQuestion({ type: "LONG_TEXT", text: "What was confusing?", position: 2, category: "Friction", required: false });
  const answers: Record<string, QuestionAnswerData> = {
    [qRating.id]: ratingAnswers(qRating),
    [qYesNo.id]: { questionId: qYesNo.id, answerCount: 10, booleanCounts: { yes: 7, no: 3 } },
    [qText.id]: {
      questionId: qText.id,
      answerCount: 4,
      texts: [
        { text: "The terminology was confusing", submissionId: "s1", submittedAt: null, consentToQuote: true },
        { text: "Some terminology is confusing", submissionId: "s2", submittedAt: null, consentToQuote: true },
        { text: "Nothing really", submissionId: "s3", submittedAt: null, consentToQuote: false },
        { text: "Loading was slow", submissionId: "s4", submittedAt: null, consentToQuote: null },
      ],
    },
  };
  return { qRating, qYesNo, qText, answers };
}

describe("buildDashboard (PRD §35, §86–§89, §130)", () => {
  it("produces a dashboard with real numbers for 10 responses", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(makeAnalyticsInput([qRating, qYesNo, qText], answers, { responses: 10 }));

    expect(d.campaignId).toBe("c1");
    expect(d.versionId).toBe("v1");
    expect(d.versionNumber).toBe(1);
    expect(d.responseCount).toBe(10);
    expect(d.insufficientData).toBe(false);
    expect(d.filtered).toBe(false);
    expect(d.blocks).toHaveLength(3);
    expect(d.themes).toHaveLength(1);
    expect(d.comparisons).toEqual([]);
    expect(d.segments).toEqual([]);

    const rating = d.blocks.find((b) => b.questionId === qRating.id) as RatingDistributionBlock;
    expect(rating.kind).toBe("RATING_DISTRIBUTION");
    expect(rating.average).toBe(4);
    expect(rating.distribution.map((x) => x.percent)).toEqual([0, 10, 20, 30, 40]);
  });

  it("summary sentences cite real numbers", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(makeAnalyticsInput([qRating, qYesNo, qText], answers, { responses: 10 }));
    expect(d.summary[0]).toBe("10 students responded.");
    expect(d.summary).toContain("Highest rated: “How useful was Orizenn?” at 4.0 / 5.");
    expect(d.summary).toContain("“Did you change your project afterwards?”: 7 of 10 (70%) said yes.");
    expect(d.summary.some((s) => s.startsWith("The most frequently mentioned theme in “What was confusing?”"))).toBe(true);
    // Every number in the summary is traceable to the data.
    expect(d.summary.join(" ")).not.toMatch(/NaN|undefined|null/);
  });

  it("singular wording for one response and a filtered-view marker", () => {
    const q = makeQuestion({ type: "RATING" });
    const d = buildDashboard(
      makeAnalyticsInput([q], { [q.id]: { questionId: q.id, answerCount: 1, numberCounts: [{ value: 5, count: 1 }] } }, { responses: 1, filtered: true }),
    );
    expect(d.summary[0]).toBe("1 student responded (filtered view).");
  });

  it("no responses → 'No responses yet.'", () => {
    const q = makeQuestion({ type: "RATING" });
    const d = buildDashboard(makeAnalyticsInput([q], {}, { responses: 0 }));
    expect(d.summary).toEqual(["No responses yet."]);
    expect(d.insufficientData).toBe(true);
    expect(d.timeline.accessibleSummary).toBe("No responses yet.");
  });

  it("insufficientData when fewer than 5 responses: no insights, caveat in summary", () => {
    const q = makeQuestion({ type: "RATING" });
    const d = buildDashboard(
      makeAnalyticsInput([q], { [q.id]: { questionId: q.id, answerCount: 3, numberCounts: [{ value: 4, count: 3 }] } }, { responses: 3 }),
    );
    expect(d.insufficientData).toBe(true);
    expect(d.questionInsights).toEqual([]);
    expect(d.summary[0]).toBe("3 students responded.");
    expect(d.summary.some((s) => s.startsWith("Not enough responses yet"))).toBe(true);
    expect(d.summary.some((s) => s.startsWith("Highest rated"))).toBe(false);
  });

  it("metric stat blocks", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(
      makeAnalyticsInput([qRating, qYesNo, qText], answers, { responses: 10, totals: makeTotals(10, { abandonedCount: 2, avgDurationSeconds: 95 }) }),
    );
    const byId = Object.fromEntries(d.metrics.map((m) => [m.id, m]));
    expect(byId["stat:responses"].value).toBe("10");
    expect(byId["stat:completion"].value).toBe("83%");
    expect(byId["stat:completion"].hint).toBe("10 of 12 started");
    expect(byId["stat:duration"].value).toBe("1m 35s");
    expect(byId["stat:questions"].value).toBe("3");
    expect(byId["stat:version"].value).toBe("v1");
    expect(d.summary).toContain("83% of students who started completed the form.");
  });

  it("timeline block reports the peak day", () => {
    const q = makeQuestion({ type: "RATING" });
    const d = buildDashboard(
      makeAnalyticsInput([q], {}, {
        responses: 6,
        timeline: [
          { date: "2026-09-01", count: 2 },
          { date: "2026-09-02", count: 4 },
        ],
      }),
    );
    expect(d.timeline.kind).toBe("TIMELINE");
    expect(d.timeline.points).toHaveLength(2);
    expect(d.timeline.accessibleSummary).toBe("Responses over 2 days. Peak of 4 on 2026-09-02.");
  });

  it("question insights cite counts from the blocks", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(makeAnalyticsInput([qRating, qYesNo, qText], answers, { responses: 10 }));
    const ratingInsight = d.questionInsights.find((i) => i.questionId === qRating.id);
    expect(ratingInsight?.sentence).toBe("Average 4.0 / 5 from 10 answers; 4 of 10 selected 5.");
    const yesNoInsight = d.questionInsights.find((i) => i.questionId === qYesNo.id);
    expect(yesNoInsight?.sentence).toBe("7 of 10 respondents (70%) answered yes.");
    const themeInsight = d.questionInsights.find((i) => i.questionId === qText.id);
    expect(themeInsight?.sentence).toMatch(/^Most frequent theme: .+ \(2 of 4 written answers\)\.$/);
  });

  it("skips insights for questions hidden from the summary or without answers", () => {
    const hidden = makeQuestion({ type: "RATING", analytics: { displayPriority: 100, showInSummary: false } });
    const empty = makeQuestion({ type: "YES_NO", position: 1 });
    const d = buildDashboard(makeAnalyticsInput([hidden, empty], { [hidden.id]: ratingAnswers(hidden) }, { responses: 10 }));
    expect(d.questionInsights).toEqual([]);
  });
});

describe("headlineFor (PRD §40–§41)", () => {
  const q = (category: string | null) => makeQuestion({ category });

  it("'Student Experience' for usability / understanding heavy forms", () => {
    expect(headlineFor([q("Usability"), q("Understanding"), q("Value")])).toBe("Student Experience");
    expect(headlineFor([q("understanding")])).toBe("Student Experience");
    // A single improvement question does not outweigh two usability ones.
    expect(headlineFor([q("Usability"), q("Usability"), q("Improvement")])).toBe("Student Experience");
  });

  it("'Improvement Impact' when improvement / behavior make up at least half", () => {
    expect(headlineFor([q("Improvement"), q("Behavior"), q("Usability")])).toBe("Improvement Impact");
    expect(headlineFor([q("Improvement"), q("Value")])).toBe("Improvement Impact");
  });

  it("other dominant categories", () => {
    expect(headlineFor([q("Value"), q("Accuracy"), q("Value")])).toBe("Perceived Value");
    expect(headlineFor([q("Onboarding")])).toBe("Onboarding Experience");
    expect(headlineFor([q("Trust")])).toBe("Trust & Accuracy");
    expect(headlineFor([q("Friction")])).toBe("Friction & Confusion");
  });

  it("falls back to 'Campaign Results'", () => {
    expect(headlineFor([])).toBe("Campaign Results");
    expect(headlineFor([q(null), q("")])).toBe("Campaign Results");
    expect(headlineFor([q("Other")])).toBe("Campaign Results");
  });
});

describe("block ordering (PRD §88)", () => {
  it("displayPriority first, then category weight, then position", () => {
    const friction = makeQuestion({ type: "RATING", position: 0, category: "Friction", analytics: { displayPriority: 100, showInSummary: true } });
    const usability = makeQuestion({ type: "RATING", position: 1, category: "Usability", analytics: { displayPriority: 100, showInSummary: true } });
    const pinned = makeQuestion({ type: "RATING", position: 2, category: null, analytics: { displayPriority: 1, showInSummary: true } });
    const uncategorised = makeQuestion({ type: "RATING", position: 3, category: null, analytics: { displayPriority: 100, showInSummary: true } });
    const later = makeQuestion({ type: "RATING", position: 4, category: "Friction", analytics: { displayPriority: 100, showInSummary: true } });

    // Deliberately shuffled input: the engine sorts by position first.
    const d = buildDashboard(makeAnalyticsInput([later, uncategorised, friction, pinned, usability], {}, { responses: 10 }));
    expect(d.blocks.map((b) => b.questionId)).toEqual([pinned.id, usability.id, friction.id, later.id, uncategorised.id]);
  });
});

describe("version comparisons (PRD §39, §131)", () => {
  it("attaches a comparison when the previous version has the comparable key with ≥ 5 answers", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(
      makeAnalyticsInput([qRating, qYesNo, qText], answers, {
        responses: 10,
        version: { id: "v2", versionNumber: 2, publishedAt: null },
        previous: {
          versionNumber: 1,
          responseCount: 8,
          comparable: {
            usefulness: { average: 3.5, count: 8, questionText: "How useful was it?" },
            changed_project: { average: 0.5, count: 8, questionText: "Did you change anything?" },
          },
        },
      }),
    );
    const rating = d.blocks.find((b) => b.questionId === qRating.id) as RatingDistributionBlock;
    expect(rating.comparison).toEqual({ previousVersionNumber: 1, previous: 3.5, current: 4, delta: 0.5, unit: "average" });
    const yesNo = d.blocks.find((b) => b.questionId === qYesNo.id) as YesNoBlock;
    expect(yesNo.comparison).toEqual({ previousVersionNumber: 1, previous: 50, current: 70, delta: 20, unit: "percent" });
    expect(d.comparisons).toHaveLength(2);
    expect(d.summary).toContain("“How useful was Orizenn?” is up versus v1: 3.5 → 4.");
    expect(d.summary).toContain("“Did you change your project afterwards?” is up versus v1: 50% → 70%.");
  });

  it("does not compare when the previous version has fewer than 5 answers for the key", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(
      makeAnalyticsInput([qRating, qYesNo, qText], answers, {
        responses: 10,
        previous: { versionNumber: 1, responseCount: 4, comparable: { usefulness: { average: 3.5, count: 4, questionText: "x" } } },
      }),
    );
    expect(d.comparisons).toEqual([]);
    expect(d.blocks.every((b) => b.comparison === undefined)).toBe(true);
  });

  it("does not compare when the key is missing from the previous version or the question has no comparable key", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const noKey = { ...qRating, comparableKey: null };
    const d = buildDashboard(
      makeAnalyticsInput([noKey, qYesNo, qText], answers, {
        responses: 10,
        previous: { versionNumber: 1, responseCount: 10, comparable: { usefulness: { average: 3.5, count: 10, questionText: "x" }, other: { average: 1, count: 10, questionText: "y" } } },
      }),
    );
    expect(d.comparisons).toEqual([]);
  });

  it("never compares text questions even when a comparable key matches (type mismatch)", () => {
    const text = makeQuestion({ type: "LONG_TEXT", comparableKey: "usefulness" });
    const d = buildDashboard(
      makeAnalyticsInput([text], { [text.id]: { questionId: text.id, answerCount: 6, texts: [] } }, {
        responses: 6,
        previous: { versionNumber: 1, responseCount: 10, comparable: { usefulness: { average: 3.5, count: 10, questionText: "x" } } },
      }),
    );
    expect(d.comparisons).toEqual([]);
  });
});

describe("segment comparison blocks (PRD §47)", () => {
  it("only for numeric / yes-no questions with at least 2 groups of ≥ 2 answers", () => {
    const { qRating, qYesNo, qText, answers } = fixture();
    const d = buildDashboard(
      makeAnalyticsInput([qRating, qYesNo, qText], answers, {
        responses: 10,
        segments: {
          by: "Year",
          byKey: "year",
          groups: [
            { label: "1st year", submissionCount: 5, metrics: { [qRating.id]: { average: 4.2, count: 5 }, [qYesNo.id]: { average: 0.8, count: 5 } } },
            { label: "2nd year", submissionCount: 5, metrics: { [qRating.id]: { average: 3.6, count: 5 }, [qYesNo.id]: { average: 0.5, count: 1 } } },
          ],
        },
      }),
    );
    expect(d.segments).toHaveLength(1);
    const seg = d.segments[0];
    expect(seg.questionId).toBe(qRating.id);
    expect(seg.by).toBe("Year");
    expect(seg.unit).toBe("average");
    expect(seg.rows).toEqual([
      { label: "1st year", value: 4.2, count: 5 },
      { label: "2nd year", value: 3.6, count: 5 },
    ]);
    expect(seg.accessibleSummary).toBe("How useful was Orizenn? by Year: highest 1st year (4.2), lowest 2nd year (3.6).");
  });

  it("yes/no segments are expressed as percents", () => {
    const q = makeQuestion({ type: "YES_NO", text: "Changed?" });
    const d = buildDashboard(
      makeAnalyticsInput([q], { [q.id]: { questionId: q.id, answerCount: 10, booleanCounts: { yes: 5, no: 5 } } }, {
        responses: 10,
        segments: {
          by: "Branch",
          byKey: "branch",
          groups: [
            { label: "CSE", submissionCount: 4, metrics: { [q.id]: { average: 0.75, count: 4 } } },
            { label: "ECE", submissionCount: 6, metrics: { [q.id]: { average: 0.5, count: 6 } } },
          ],
        },
      }),
    );
    expect(d.segments[0].unit).toBe("percent");
    expect(d.segments[0].rows.map((r) => r.value)).toEqual([75, 50]);
    expect(d.segments[0].accessibleSummary).toContain("highest CSE (75%)");
  });

  it("no blocks with a single group", () => {
    const { qRating, answers } = fixture();
    const d = buildDashboard(
      makeAnalyticsInput([qRating], { [qRating.id]: answers[qRating.id] }, {
        responses: 10,
        segments: { by: "Year", byKey: "year", groups: [{ label: "1st", submissionCount: 10, metrics: { [qRating.id]: { average: 4, count: 10 } } }] },
      }),
    );
    expect(d.segments).toEqual([]);
  });
});

describe("analyzeQuestion dispatch", () => {
  const dispatch = (q: QuestionDefinition) => analyzeQuestion(q, makeAnalyticsInput([q], {}, { responses: 0 }), 0).kind;

  it("maps every analytics type to the matching block kind", () => {
    expect(dispatch(makeQuestion({ type: "RATING" }))).toBe("RATING_DISTRIBUTION");
    expect(dispatch(makeQuestion({ type: "SCALE" }))).toBe("SCALE_DISTRIBUTION");
    expect(dispatch(makeQuestion({ type: "NUMBER" }))).toBe("NUMBER_SUMMARY");
    expect(dispatch(makeQuestion({ type: "SINGLE_CHOICE" }))).toBe("OPTION_DISTRIBUTION");
    expect(dispatch(makeQuestion({ type: "DROPDOWN" }))).toBe("SEGMENT_DISTRIBUTION");
    expect(dispatch(makeQuestion({ type: "MULTIPLE_CHOICE" }))).toBe("MULTI_SELECT_FREQUENCY");
    expect(dispatch(makeQuestion({ type: "YES_NO" }))).toBe("YES_NO_DISTRIBUTION");
    expect(dispatch(makeQuestion({ type: "SHORT_TEXT" }))).toBe("TEXT_RESPONSES");
    expect(dispatch(makeQuestion({ type: "LONG_TEXT" }))).toBe("THEME_CLUSTER");
  });

  it("a RATING with NUMBER_SUMMARY still renders as a rating distribution", () => {
    expect(dispatch(makeQuestion({ type: "RATING", analyticsType: "NUMBER_SUMMARY" }))).toBe("RATING_DISTRIBUTION");
  });
});
