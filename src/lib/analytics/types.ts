import type { QuestionDefinition, ResponseMode } from "@/lib/forms/definitions";
import type { AnalyticsFilters } from "@/lib/validation/filters";

/** Aggregated answer data for one question, produced by SQL/Prisma aggregation (PRD §95). */
export interface QuestionAnswerData {
  questionId: string;
  /** Submissions that answered this question. */
  answerCount: number;
  /** RATING / SCALE / NUMBER — grouped counts per numeric value. */
  numberCounts?: Array<{ value: number; count: number }>;
  /** YES_NO */
  booleanCounts?: { yes: number; no: number };
  /** SINGLE_CHOICE / DROPDOWN — grouped counts per option value. */
  textCounts?: Array<{ value: string; count: number }>;
  /** MULTIPLE_CHOICE — one array per submission. */
  jsonValues?: string[][];
  /** SHORT_TEXT / LONG_TEXT — bounded sample of responses (newest first). */
  texts?: Array<{ text: string; submissionId: string; submittedAt: Date | null; consentToQuote: boolean | null }>;
}

export interface TotalsData {
  totalSubmissions: number;
  completedSubmissions: number;
  startedCount: number;
  abandonedCount: number;
  invalidCount: number;
  avgDurationSeconds: number | null;
  avgCompletionPercent: number | null;
}

export interface TimelinePoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface SegmentData {
  /** Human label for the segmenting dimension, e.g. "Year" or a question text. */
  by: string;
  byKey: string;
  groups: Array<{
    label: string;
    submissionCount: number;
    /** Per numeric/yes-no question: average (or yes-rate 0–1) and count. */
    metrics: Record<string, { average: number; count: number }>;
  }>;
}

export interface PreviousVersionData {
  versionNumber: number;
  responseCount: number;
  /** Keyed by comparableKey. average = mean for numeric, yes-rate (0–1) for YES_NO. */
  comparable: Record<string, { average: number; count: number; questionText: string }>;
}

export interface AnalyticsInput {
  campaign: {
    id: string;
    name: string;
    goal: string;
    responseMode: ResponseMode;
    status: string;
  };
  version: {
    id: string;
    versionNumber: number;
    publishedAt: Date | null;
  };
  questions: QuestionDefinition[];
  totals: TotalsData;
  timeline: TimelinePoint[];
  answers: Record<string, QuestionAnswerData>;
  segments?: SegmentData;
  previous?: PreviousVersionData;
  filters: AnalyticsFilters;
  filtered: boolean;
}

// ───────────────────────── Output blocks (PRD §87) ─────────────────────────

export interface DistributionBucket {
  value: string;
  label: string;
  count: number;
  percent: number;
}

export interface Comparison {
  previousVersionNumber: number;
  previous: number;
  current: number;
  delta: number;
  unit: "average" | "percent";
}

interface QuestionBlockBase {
  id: string;
  questionId: string;
  questionKey: string;
  title: string;
  category: string | null;
  displayPriority: number;
  showInSummary: boolean;
  answerCount: number;
  answerRate: number;
  accessibleSummary: string;
  comparison?: Comparison;
}

export interface StatBlock {
  kind: "STAT";
  id: string;
  title: string;
  value: string;
  hint?: string;
}

export interface RatingDistributionBlock extends QuestionBlockBase {
  kind: "RATING_DISTRIBUTION" | "SCALE_DISTRIBUTION";
  average: number | null;
  median: number | null;
  min: number;
  max: number;
  distribution: DistributionBucket[];
  /** Share of answers in the top two values (RATING) — useful "favourable" summary. */
  favourablePercent: number | null;
}

export interface OptionDistributionBlock extends QuestionBlockBase {
  kind: "OPTION_DISTRIBUTION" | "SEGMENT_DISTRIBUTION";
  distribution: DistributionBucket[];
  top: DistributionBucket | null;
}

export interface MultiSelectBlock extends QuestionBlockBase {
  kind: "MULTI_SELECT_FREQUENCY";
  items: DistributionBucket[]; // percent = share of respondents who selected it
  averageSelections: number | null;
}

export interface YesNoBlock extends QuestionBlockBase {
  kind: "YES_NO_DISTRIBUTION";
  yes: number;
  no: number;
  yesPercent: number | null;
}

export interface NumberSummaryBlock extends QuestionBlockBase {
  kind: "NUMBER_SUMMARY";
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  buckets: DistributionBucket[];
}

export interface TextResponsesBlock extends QuestionBlockBase {
  kind: "TEXT_RESPONSES";
  responses: Array<{ text: string; submissionId: string; quotable: boolean }>;
  keywords: Array<{ word: string; count: number }>;
  truncated: boolean;
}

export interface Theme {
  id: string;
  name: string;
  count: number;
  percent: number;
  keywords: string[];
  /** Actual response texts (never fabricated). */
  responses: Array<{ text: string; submissionId: string; quotable: boolean }>;
}

export interface ThemeClusterBlock extends QuestionBlockBase {
  kind: "THEME_CLUSTER";
  themes: Theme[];
  source: "deterministic" | "ai";
  uncategorised: number;
  responses: Array<{ text: string; submissionId: string; quotable: boolean }>;
}

export interface TimelineBlock {
  kind: "TIMELINE";
  id: string;
  title: string;
  points: TimelinePoint[];
  accessibleSummary: string;
}

export interface SegmentComparisonBlock {
  kind: "SEGMENT_COMPARISON";
  id: string;
  title: string;
  by: string;
  questionId: string;
  unit: "average" | "percent";
  rows: Array<{ label: string; value: number; count: number }>;
  accessibleSummary: string;
}

export interface AISummaryBlock {
  kind: "AI_SUMMARY";
  id: string;
  title: string;
  summary: string;
  findings: Array<{ title: string; description: string; sourceQuestionIds: string[] }>;
  generatedAt: Date;
  sourceResponseCount: number;
}

export type QuestionBlock =
  | RatingDistributionBlock
  | OptionDistributionBlock
  | MultiSelectBlock
  | YesNoBlock
  | NumberSummaryBlock
  | TextResponsesBlock
  | ThemeClusterBlock;

export type AnalyticsBlock = StatBlock | QuestionBlock | TimelineBlock | SegmentComparisonBlock | AISummaryBlock;

export interface QuestionInsight {
  questionId: string;
  title: string;
  sentence: string;
}

export interface AnalyticsDashboard {
  campaignId: string;
  versionId: string;
  versionNumber: number;
  generatedAt: Date;
  responseCount: number;
  filtered: boolean;
  /** True when there is too little data to draw conclusions (PRD §100). */
  insufficientData: boolean;
  /** Dashboard heading derived from question categories, e.g. "Student Experience". */
  headline: string;
  summary: string[];
  metrics: StatBlock[];
  timeline: TimelineBlock;
  blocks: QuestionBlock[];
  themes: ThemeClusterBlock[];
  comparisons: Comparison[];
  segments: SegmentComparisonBlock[];
  questionInsights: QuestionInsight[];
}
