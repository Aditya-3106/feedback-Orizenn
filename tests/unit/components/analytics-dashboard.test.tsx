// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { buildDashboard } from "@/lib/analytics/engine";
import type { AnalyticsInput, QuestionAnswerData } from "@/lib/analytics/types";
import type { QuestionDefinition } from "@/lib/forms/definitions";

// jsdom has no layout, so recharts' ResponsiveContainer (ResizeObserver) can't
// measure anything. The charts are aria-hidden decoration over the engine's
// accessible summaries, so stubbing the library keeps the test about the DOM we own.
vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div data-testid="recharts">{children}</div>;
  const Leaf = () => null;
  return {
    ResponsiveContainer: Box,
    AreaChart: Box,
    BarChart: Box,
    Area: Leaf,
    Bar: Leaf,
    Cell: Leaf,
    LabelList: Leaf,
    CartesianGrid: Leaf,
    Tooltip: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

function question(overrides: Partial<QuestionDefinition> & Pick<QuestionDefinition, "id" | "type" | "analyticsType" | "text">): QuestionDefinition {
  return {
    key: overrides.id,
    position: 0,
    description: null,
    required: true,
    category: null,
    comparableKey: null,
    validation: {},
    analytics: { displayPriority: 100, showInSummary: true },
    options: [],
    ...overrides,
  };
}

const questions: QuestionDefinition[] = [
  question({ id: "q1", key: "q1", position: 1, type: "RATING", analyticsType: "RATING_DISTRIBUTION", text: "How easy was Orizenn to use?", category: "Usability", comparableKey: "ease", validation: { min: 1, max: 5 } }),
  question({
    id: "q2",
    key: "q2",
    position: 2,
    type: "SINGLE_CHOICE",
    analyticsType: "OPTION_DISTRIBUTION",
    text: "Which feature did you use most?",
    category: "Behavior",
    options: [
      { id: "o1", label: "Plagiarism check", value: "plag", position: 1 },
      { id: "o2", label: "Report generation", value: "report", position: 2 },
      { id: "o3", label: "Citations", value: "cite", position: 3 },
    ],
  }),
  question({
    id: "q3",
    key: "q3",
    position: 3,
    type: "MULTIPLE_CHOICE",
    analyticsType: "MULTI_SELECT_FREQUENCY",
    text: "Where did you get stuck?",
    category: "Friction",
    options: [
      { id: "m1", label: "Upload", value: "upload", position: 1 },
      { id: "m2", label: "Results page", value: "results", position: 2 },
    ],
  }),
  question({ id: "q4", key: "q4", position: 4, type: "YES_NO", analyticsType: "YES_NO_DISTRIBUTION", text: "Would you use Orizenn again?", category: "Return Intent", comparableKey: "return" }),
  question({ id: "q5", key: "q5", position: 5, type: "SHORT_TEXT", analyticsType: "TEXT_RESPONSES", text: "One word that describes Orizenn", category: "Understanding" }),
  question({ id: "q6", key: "q6", position: 6, type: "LONG_TEXT", analyticsType: "THEME_CLUSTER", text: "What should we improve?", category: "Improvement" }),
  question({ id: "q7", key: "q7", position: 7, type: "NUMBER", analyticsType: "NUMBER_SUMMARY", text: "How many reports did you run?", category: "Behavior" }),
  question({ id: "q8", key: "q8", position: 8, type: "SCALE", analyticsType: "SCALE_DISTRIBUTION", text: "How likely are you to recommend Orizenn?", category: "Value", validation: { min: 0, max: 10 } }),
];

const texts = (items: Array<[string, boolean]>): QuestionAnswerData["texts"] =>
  items.map(([text, consent], i) => ({ text, submissionId: `s${i + 1}`, submittedAt: new Date("2026-09-10"), consentToQuote: consent }));

function input(completed: number): AnalyticsInput {
  const answers: Record<string, QuestionAnswerData> = {
    q1: { questionId: "q1", answerCount: completed, numberCounts: [{ value: 5, count: Math.ceil(completed / 2) }, { value: 4, count: Math.floor(completed / 2) }] },
    q2: { questionId: "q2", answerCount: completed, textCounts: [{ value: "plag", count: Math.ceil(completed / 2) }, { value: "report", count: Math.floor(completed / 2) }] },
    q3: { questionId: "q3", answerCount: completed, jsonValues: Array.from({ length: completed }, (_, i) => (i % 2 ? ["upload"] : ["upload", "results"])) },
    q4: { questionId: "q4", answerCount: completed, booleanCounts: { yes: Math.ceil(completed * 0.75), no: completed - Math.ceil(completed * 0.75) } },
    q5: { questionId: "q5", answerCount: 3, texts: texts([["fast", true], ["fast and clear", false], ["clear", true]]) },
    q6: {
      questionId: "q6",
      answerCount: 4,
      texts: texts([
        ["The explanation of the plagiarism score was confusing.", true],
        ["Better explanation of the score please.", false],
        ["Upload was slow on campus wifi.", true],
        ["Slow upload, otherwise fine.", false],
      ]),
    },
    q7: { questionId: "q7", answerCount: completed, numberCounts: [{ value: 2, count: completed }] },
    q8: { questionId: "q8", answerCount: completed, numberCounts: [{ value: 9, count: completed }] },
  };
  return {
    campaign: { id: "c1", name: "Pilot", goal: "Understand usability", responseMode: "PSEUDONYMOUS", status: "ACTIVE" },
    version: { id: "v2", versionNumber: 2, publishedAt: new Date("2026-09-01") },
    questions,
    totals: {
      totalSubmissions: completed + 3,
      completedSubmissions: completed,
      startedCount: 1,
      abandonedCount: 2,
      invalidCount: 0,
      avgDurationSeconds: 95,
      avgCompletionPercent: 90,
    },
    timeline: [
      { date: "2026-09-10", count: Math.max(1, completed - 2) },
      { date: "2026-09-11", count: 2 },
    ],
    answers,
    previous: { versionNumber: 1, responseCount: 12, comparable: { ease: { average: 3.8, count: 12, questionText: "How easy was it?" } } },
    segments: {
      by: "Year",
      byKey: "year",
      groups: [
        { label: "2nd year", submissionCount: 10, metrics: { q1: { average: 4.2, count: 10 }, q4: { average: 0.8, count: 10 } } },
        { label: "3rd year", submissionCount: 8, metrics: { q1: { average: 4.6, count: 8 }, q4: { average: 0.7, count: 8 } } },
      ],
    },
    filters: {},
    filtered: false,
  };
}

describe("AnalyticsDashboard", () => {
  it("renders the headline, metrics, every block with its accessible summary, and comparisons", () => {
    const dashboard = buildDashboard(input(24));
    render(<AnalyticsDashboard dashboard={dashboard} clearFiltersHref="/admin/campaigns/c1/analytics" />);

    expect(screen.getByRole("heading", { name: dashboard.headline })).toBeInTheDocument();
    expect(dashboard.headline).toBe("Student Experience");

    // Metrics row.
    const metrics = within(screen.getByRole("list", { name: "Key metrics" }));
    for (const m of dashboard.metrics) expect(metrics.getByText(m.title)).toBeInTheDocument();
    expect(metrics.getByText("24")).toBeInTheDocument();
    expect(metrics.getByText("v2")).toBeInTheDocument();

    // Every question block renders in the engine's order with its title and a11y summary.
    expect(dashboard.blocks).toHaveLength(questions.length);
    const questionsRegion = within(screen.getByRole("region", { name: "By question" }));
    const headings = questionsRegion.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(dashboard.blocks.map((b) => b.title));
    for (const b of dashboard.blocks) {
      expect(screen.getAllByText(b.accessibleSummary).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getAllByText("Text summary").length).toBeGreaterThanOrEqual(dashboard.blocks.length);

    // Timeline + summary + segments.
    expect(screen.getByText(dashboard.timeline.title)).toBeInTheDocument();
    expect(screen.getByText(dashboard.timeline.accessibleSummary)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What the responses say" })).toBeInTheDocument();
    for (const line of dashboard.summary) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compare by Year" })).toBeInTheDocument();

    // Comparison badge only where the engine attached one.
    expect(dashboard.comparisons).toHaveLength(1);
    expect(screen.getByText(/v1 3\.8 → 4\.5 \(\+0\.7\)/)).toBeInTheDocument();
    expect(screen.queryByText("Showing a filtered view", { exact: false })).not.toBeInTheDocument();

    // Theme block quotes only consented responses.
    expect(screen.getAllByText("— Anonymous respondent").length).toBe(2);
    expect(screen.queryByText("“Better explanation of the score please.”")).not.toBeInTheDocument();
  });

  it("renders the insufficient-data state when there are fewer than 5 responses", () => {
    const dashboard = buildDashboard(input(3));
    expect(dashboard.insufficientData).toBe(true);
    render(<AnalyticsDashboard dashboard={dashboard} />);

    expect(screen.getByText("Not enough responses yet for reliable percentages.")).toBeInTheDocument();
    // Blocks still render (counts), but percent-based chrome is hidden.
    for (const b of dashboard.blocks) expect(screen.getAllByText(b.title).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Favourable")).not.toBeInTheDocument();
    expect(screen.queryByText(/answer rate/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Compare by/ })).not.toBeInTheDocument();
  });

  it("shows the filtered notice with a clear link", () => {
    const dashboard = buildDashboard({ ...input(10), filtered: true });
    render(<AnalyticsDashboard dashboard={dashboard} clearFiltersHref="/admin/campaigns/c1/analytics" />);
    expect(screen.getByText(/Showing a filtered view · 10 responses/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/campaigns/c1/analytics");
  });
});
