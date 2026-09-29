import type { QuestionDefinition } from "@/lib/forms/definitions";
import { MIN_RESPONSES_FOR_INSIGHT, completionRate, percent, round } from "./metrics";
import { analyzeMultiChoice } from "./question-analyzers/multi-choice";
import { analyzeNumber } from "./question-analyzers/number";
import { analyzeRating } from "./question-analyzers/rating";
import { analyzeSingleChoice } from "./question-analyzers/single-choice";
import { analyzeText } from "./question-analyzers/text";
import { analyzeThemes } from "./question-analyzers/themes";
import { analyzeYesNo } from "./question-analyzers/yes-no";
import type {
  AnalyticsDashboard,
  AnalyticsInput,
  Comparison,
  QuestionBlock,
  QuestionInsight,
  SegmentComparisonBlock,
  StatBlock,
  ThemeClusterBlock,
  TimelineBlock,
} from "./types";
import { formatDuration } from "@/lib/utils/format";

/**
 * Analytics engine (PRD §35, §86–§89, §142–§144).
 *
 * Input is a form definition plus pre-aggregated answer data; output is a
 * dashboard description made of typed blocks. Nothing here knows about React,
 * campaign names or question wording — only `question.type`, `analyticsType`,
 * `category`, `comparableKey` and the numbers.
 */
export function buildDashboard(input: AnalyticsInput): AnalyticsDashboard {
  const total = input.totals.completedSubmissions;
  const questions = [...input.questions].sort((a, b) => a.position - b.position);

  const blocks = questions.map((q) => analyzeQuestion(q, input, total));
  attachComparisons(blocks, input);

  const themes = blocks.filter((b): b is ThemeClusterBlock => b.kind === "THEME_CLUSTER");
  const comparisons = blocks.map((b) => b.comparison).filter((c): c is Comparison => !!c);
  const segments = buildSegmentBlocks(questions, input);

  const ordered = orderBlocks(blocks);

  const dashboard: AnalyticsDashboard = {
    campaignId: input.campaign.id,
    versionId: input.version.id,
    versionNumber: input.version.versionNumber,
    generatedAt: new Date(),
    responseCount: total,
    filtered: input.filtered,
    insufficientData: total < MIN_RESPONSES_FOR_INSIGHT,
    headline: headlineFor(questions),
    summary: [],
    metrics: buildMetrics(input),
    timeline: buildTimeline(input),
    blocks: ordered,
    themes,
    comparisons,
    segments,
    questionInsights: [],
  };

  dashboard.questionInsights = buildQuestionInsights(ordered, total);
  dashboard.summary = buildSummary(dashboard, input);
  return dashboard;
}

export function analyzeQuestion(q: QuestionDefinition, input: AnalyticsInput, total: number): QuestionBlock {
  const data = input.answers[q.id];
  switch (q.analyticsType) {
    case "RATING_DISTRIBUTION":
    case "SCALE_DISTRIBUTION":
      return analyzeRating(q, data, total);
    case "NUMBER_SUMMARY":
      return q.type === "NUMBER" ? analyzeNumber(q, data, total) : analyzeRating(q, data, total);
    case "OPTION_DISTRIBUTION":
    case "SEGMENT_DISTRIBUTION":
      return analyzeSingleChoice(q, data, total);
    case "MULTI_SELECT_FREQUENCY":
      return analyzeMultiChoice(q, data, total);
    case "YES_NO_DISTRIBUTION":
      return analyzeYesNo(q, data, total);
    case "TEXT_RESPONSES":
      return analyzeText(q, data, total);
    case "THEME_CLUSTER":
      return analyzeThemes(q, data, total);
  }
}

/** Sort by displayPriority (asc), then category weight, then position (PRD §88). */
const CATEGORY_WEIGHT: Record<string, number> = {
  usability: 10,
  understanding: 20,
  value: 30,
  accuracy: 40,
  discovery: 50,
  behavior: 55,
  friction: 60,
  improvement: 70,
  "return intent": 80,
  trust: 85,
  onboarding: 90,
};

function orderBlocks(blocks: QuestionBlock[]): QuestionBlock[] {
  const positions = new Map(blocks.map((b, i) => [b.id, i]));
  return [...blocks].sort((a, b) => {
    if (a.displayPriority !== b.displayPriority) return a.displayPriority - b.displayPriority;
    const wa = CATEGORY_WEIGHT[(a.category ?? "").toLowerCase()] ?? 100;
    const wb = CATEGORY_WEIGHT[(b.category ?? "").toLowerCase()] ?? 100;
    if (wa !== wb) return wa - wb;
    return (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0);
  });
}

/** Dashboard heading from the dominant categories (PRD §40–§41). */
export function headlineFor(questions: readonly QuestionDefinition[]): string {
  const counts = new Map<string, number>();
  for (const q of questions) {
    const c = (q.category ?? "").toLowerCase();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (!counts.size) return "Campaign Results";
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  const has = (c: string) => counts.has(c);
  if (has("improvement") || has("behavior")) {
    if ((counts.get("improvement") ?? 0) + (counts.get("behavior") ?? 0) >= questions.length / 2) return "Improvement Impact";
  }
  if (has("usability") || has("understanding")) return "Student Experience";
  if (top === "value" || top === "accuracy") return "Perceived Value";
  if (top === "onboarding") return "Onboarding Experience";
  if (top === "trust") return "Trust & Accuracy";
  if (top === "friction") return "Friction & Confusion";
  return "Campaign Results";
}

function buildMetrics(input: AnalyticsInput): StatBlock[] {
  const t = input.totals;
  const started = t.completedSubmissions + t.abandonedCount + t.startedCount;
  const completion = completionRate(t.completedSubmissions, started);
  return [
    { kind: "STAT", id: "stat:responses", title: "Total responses", value: String(t.completedSubmissions) },
    {
      kind: "STAT",
      id: "stat:completion",
      title: "Completion rate",
      value: completion == null ? "—" : `${completion}%`,
      hint: started ? `${t.completedSubmissions} of ${started} started` : undefined,
    },
    {
      kind: "STAT",
      id: "stat:duration",
      title: "Avg completion time",
      value: formatDuration(t.avgDurationSeconds),
    },
    { kind: "STAT", id: "stat:questions", title: "Questions", value: String(input.questions.length) },
    {
      kind: "STAT",
      id: "stat:version",
      title: "Published version",
      value: `v${input.version.versionNumber}`,
    },
  ];
}

function buildTimeline(input: AnalyticsInput): TimelineBlock {
  const points = input.timeline;
  const peak = points.reduce<{ date: string; count: number } | null>((best, p) => (p.count > (best?.count ?? 0) ? p : best), null);
  const accessibleSummary =
    points.length && peak
      ? `Responses over ${points.length} ${points.length === 1 ? "day" : "days"}. Peak of ${peak.count} on ${peak.date}.`
      : "No responses yet.";
  return { kind: "TIMELINE", id: "timeline", title: "Responses over time", points, accessibleSummary };
}

/** PRD §39, §131: only compare explicitly comparable keys of matching types. */
function attachComparisons(blocks: QuestionBlock[], input: AnalyticsInput): void {
  const prev = input.previous;
  if (!prev) return;
  const byId = new Map(input.questions.map((q) => [q.id, q]));
  for (const b of blocks) {
    const q = byId.get(b.questionId);
    if (!q?.comparableKey) continue;
    const before = prev.comparable[q.comparableKey];
    if (!before || before.count < MIN_RESPONSES_FOR_INSIGHT) continue;

    if ((b.kind === "RATING_DISTRIBUTION" || b.kind === "SCALE_DISTRIBUTION" || b.kind === "NUMBER_SUMMARY") && b.average != null) {
      b.comparison = {
        previousVersionNumber: prev.versionNumber,
        previous: round(before.average, 2),
        current: b.average,
        delta: round(b.average - before.average, 2),
        unit: "average",
      };
    } else if (b.kind === "YES_NO_DISTRIBUTION" && b.yesPercent != null) {
      const prevPct = round(before.average * 100, 0);
      b.comparison = {
        previousVersionNumber: prev.versionNumber,
        previous: prevPct,
        current: b.yesPercent,
        delta: round(b.yesPercent - prevPct, 0),
        unit: "percent",
      };
    }
  }
}

/** PRD §47: cross-segment comparison for numeric and yes/no questions. */
function buildSegmentBlocks(questions: readonly QuestionDefinition[], input: AnalyticsInput): SegmentComparisonBlock[] {
  const seg = input.segments;
  if (!seg || seg.groups.length < 2) return [];
  const blocks: SegmentComparisonBlock[] = [];
  for (const q of questions) {
    const numeric = q.type === "RATING" || q.type === "SCALE" || q.type === "NUMBER";
    const yesNo = q.type === "YES_NO";
    if (!numeric && !yesNo) continue;
    const rows = seg.groups
      .map((g) => {
        const m = g.metrics[q.id];
        if (!m || m.count < 2) return null;
        return { label: g.label, value: yesNo ? round(m.average * 100, 0) : round(m.average, 2), count: m.count };
      })
      .filter((r): r is { label: string; value: number; count: number } => r !== null);
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    blocks.push({
      kind: "SEGMENT_COMPARISON",
      id: `segment:${q.id}`,
      title: q.text,
      by: seg.by,
      questionId: q.id,
      unit: yesNo ? "percent" : "average",
      rows,
      accessibleSummary: `${q.text} by ${seg.by}: highest ${sorted[0].label} (${sorted[0].value}${yesNo ? "%" : ""}), lowest ${sorted[sorted.length - 1].label} (${sorted[sorted.length - 1].value}${yesNo ? "%" : ""}).`,
    });
  }
  return blocks;
}

function buildQuestionInsights(blocks: QuestionBlock[], total: number): QuestionInsight[] {
  if (total < MIN_RESPONSES_FOR_INSIGHT) return [];
  const insights: QuestionInsight[] = [];
  for (const b of blocks) {
    if (!b.showInSummary || b.answerCount === 0) continue;
    let sentence: string | null = null;
    switch (b.kind) {
      case "RATING_DISTRIBUTION":
      case "SCALE_DISTRIBUTION": {
        const top = [...b.distribution].sort((x, y) => y.count - x.count)[0];
        sentence = `Average ${b.average?.toFixed(1)} / ${b.max} from ${b.answerCount} answers; ${top.count} of ${b.answerCount} selected ${top.label}.`;
        break;
      }
      case "NUMBER_SUMMARY":
        sentence = `Average ${b.average} (median ${b.median}) across ${b.answerCount} answers, ranging ${b.min}–${b.max}.`;
        break;
      case "OPTION_DISTRIBUTION":
      case "SEGMENT_DISTRIBUTION":
        if (b.top) sentence = `${b.top.count} of ${b.answerCount} respondents (${b.top.percent}%) chose “${b.top.label}”.`;
        break;
      case "MULTI_SELECT_FREQUENCY": {
        const top = b.items.filter((i) => i.count > 0).slice(0, 3);
        if (top.length) sentence = `Most selected: ${top.map((i) => `“${i.label}” (${i.percent}%)`).join(", ")}.`;
        break;
      }
      case "YES_NO_DISTRIBUTION":
        sentence = `${b.yes} of ${b.answerCount} respondents (${b.yesPercent}%) answered yes.`;
        break;
      case "THEME_CLUSTER":
        if (b.themes[0]) sentence = `Most frequent theme: ${b.themes[0].name} (${b.themes[0].count} of ${b.answerCount} written answers).`;
        break;
      case "TEXT_RESPONSES":
        if (b.keywords[0]) sentence = `${b.answerCount} written answers; “${b.keywords[0].word}” appears in ${b.keywords[0].count}.`;
        break;
    }
    if (sentence) insights.push({ questionId: b.questionId, title: b.title, sentence });
  }
  return insights;
}

/** PRD §130: deterministic summary sentences that cite actual numbers. */
function buildSummary(d: AnalyticsDashboard, input: AnalyticsInput): string[] {
  const total = d.responseCount;
  if (!total) return ["No responses yet."];
  const lines: string[] = [];
  lines.push(`${total} ${total === 1 ? "student" : "students"} responded${d.filtered ? " (filtered view)" : ""}.`);

  const t = input.totals;
  const started = t.completedSubmissions + t.abandonedCount + t.startedCount;
  const completion = completionRate(t.completedSubmissions, started);
  if (completion != null && started > t.completedSubmissions) lines.push(`${completion}% of students who started completed the form.`);

  if (total < MIN_RESPONSES_FOR_INSIGHT) {
    lines.push("Not enough responses yet for reliable percentages. Analytics will become more useful as responses come in.");
    return lines;
  }

  const ratings = d.blocks.filter(
    (b): b is Extract<QuestionBlock, { kind: "RATING_DISTRIBUTION" | "SCALE_DISTRIBUTION" }> =>
      (b.kind === "RATING_DISTRIBUTION" || b.kind === "SCALE_DISTRIBUTION") && b.showInSummary && b.answerCount > 0,
  );
  if (ratings.length) {
    const best = [...ratings].sort((a, b) => (b.average ?? 0) / b.max - (a.average ?? 0) / a.max)[0];
    const worst = [...ratings].sort((a, b) => (a.average ?? 0) / a.max - (b.average ?? 0) / b.max)[0];
    lines.push(`Highest rated: “${best.title}” at ${best.average?.toFixed(1)} / ${best.max}.`);
    if (worst.id !== best.id) lines.push(`Lowest rated: “${worst.title}” at ${worst.average?.toFixed(1)} / ${worst.max}.`);
  }

  const yesNo = d.blocks.filter((b): b is Extract<QuestionBlock, { kind: "YES_NO_DISTRIBUTION" }> => b.kind === "YES_NO_DISTRIBUTION" && b.showInSummary && b.answerCount > 0);
  for (const y of yesNo.slice(0, 2)) {
    lines.push(`“${y.title}”: ${y.yes} of ${y.answerCount} (${y.yesPercent}%) said yes.`);
  }

  const theme = d.themes.find((t) => t.themes.length > 0);
  if (theme) {
    const top = theme.themes[0];
    lines.push(`The most frequently mentioned theme in “${theme.title}” was ${top.name} (${top.count} of ${theme.answerCount} written answers, ${percent(top.count, theme.answerCount)}%).`);
  }

  for (const c of d.comparisons.slice(0, 2)) {
    const b = d.blocks.find((x) => x.comparison === c);
    if (!b) continue;
    const dir = c.delta > 0 ? "up" : c.delta < 0 ? "down" : "unchanged";
    lines.push(`“${b.title}” is ${dir} versus v${c.previousVersionNumber}: ${c.previous}${c.unit === "percent" ? "%" : ""} → ${c.current}${c.unit === "percent" ? "%" : ""}.`);
  }

  return lines;
}
