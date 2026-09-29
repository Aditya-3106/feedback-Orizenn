/**
 * Shared, Prisma-independent domain types for form definitions.
 *
 * "Questions are data" (PRD §143). Everything downstream — the public form
 * renderer, the submission validator, the analytics engine and the Excel
 * exporter — consumes these types, never React components or raw DB rows.
 *
 * The string unions intentionally mirror the Prisma enums 1:1 so values can
 * be passed straight through without a mapping layer.
 */

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "RATING",
  "SCALE",
  "YES_NO",
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DROPDOWN",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ANALYTICS_TYPES = [
  "RATING_DISTRIBUTION",
  "SCALE_DISTRIBUTION",
  "OPTION_DISTRIBUTION",
  "MULTI_SELECT_FREQUENCY",
  "YES_NO_DISTRIBUTION",
  "NUMBER_SUMMARY",
  "TEXT_RESPONSES",
  "THEME_CLUSTER",
  "SEGMENT_DISTRIBUTION",
] as const;
export type AnalyticsType = (typeof ANALYTICS_TYPES)[number];

export const RESPONSE_MODES = ["IDENTIFIED", "PSEUDONYMOUS", "ANONYMOUS"] as const;
export type ResponseMode = (typeof RESPONSE_MODES)[number];

export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "ARCHIVED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Respondent context fields an admin may switch on per campaign (PRD §31). */
export const RESPONDENT_FIELDS = [
  "name",
  "email",
  "college",
  "branch",
  "year",
  "projectType",
] as const;
export type RespondentField = (typeof RESPONDENT_FIELDS)[number];

export const RESPONDENT_FIELD_LABELS: Record<RespondentField, string> = {
  name: "Name",
  email: "Email",
  college: "College",
  branch: "Branch",
  year: "Year",
  projectType: "Project type",
};

/** Suggested analytics categories (PRD §133). Free text is allowed. */
export const QUESTION_CATEGORIES = [
  "Usability",
  "Understanding",
  "Value",
  "Accuracy",
  "Discovery",
  "Friction",
  "Improvement",
  "Return Intent",
  "Trust",
  "Onboarding",
  "Behavior",
  "Other",
] as const;

export interface ValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  minSelections?: number;
  maxSelections?: number;
}

export interface AnalyticsMeta {
  displayPriority: number;
  showInSummary: boolean;
}

export interface OptionDefinition {
  id: string;
  label: string;
  value: string;
  position: number;
}

export interface QuestionDefinition {
  id: string;
  key: string;
  position: number;
  text: string;
  description: string | null;
  type: QuestionType;
  required: boolean;
  category: string | null;
  analyticsType: AnalyticsType;
  comparableKey: string | null;
  validation: ValidationRules;
  analytics: AnalyticsMeta;
  options: OptionDefinition[];
}

export interface FormDefinition {
  versionId: string;
  versionNumber: number;
  introText: string | null;
  estimatedMinutes: number | null;
  campaign: {
    id: string;
    name: string;
    responseMode: ResponseMode;
    respondentFields: RespondentField[];
    requireQuoteConsent: boolean;
    allowMultipleResponses: boolean;
  };
  questions: QuestionDefinition[];
}

/** Human labels for the builder and analytics UI. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  RATING: "Rating",
  SCALE: "Scale",
  YES_NO: "Yes / No",
  SHORT_TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  DROPDOWN: "Dropdown",
};

export const ANALYTICS_TYPE_LABELS: Record<AnalyticsType, string> = {
  RATING_DISTRIBUTION: "Rating distribution",
  SCALE_DISTRIBUTION: "Scale distribution",
  OPTION_DISTRIBUTION: "Option distribution",
  MULTI_SELECT_FREQUENCY: "Selection frequency",
  YES_NO_DISTRIBUTION: "Yes / No split",
  NUMBER_SUMMARY: "Number summary",
  TEXT_RESPONSES: "Response list",
  THEME_CLUSTER: "Themes",
  SEGMENT_DISTRIBUTION: "Segment distribution",
};

/** PRD §37 default question → analytics mapping. */
export function defaultAnalyticsType(type: QuestionType): AnalyticsType {
  switch (type) {
    case "RATING":
      return "RATING_DISTRIBUTION";
    case "SCALE":
      return "SCALE_DISTRIBUTION";
    case "SINGLE_CHOICE":
      return "OPTION_DISTRIBUTION";
    case "MULTIPLE_CHOICE":
      return "MULTI_SELECT_FREQUENCY";
    case "YES_NO":
      return "YES_NO_DISTRIBUTION";
    case "NUMBER":
      return "NUMBER_SUMMARY";
    case "SHORT_TEXT":
      return "TEXT_RESPONSES";
    case "LONG_TEXT":
      return "THEME_CLUSTER";
    case "DROPDOWN":
      return "SEGMENT_DISTRIBUTION";
  }
}

/** Analytics types that are valid for a given question type. */
export function allowedAnalyticsTypes(type: QuestionType): AnalyticsType[] {
  switch (type) {
    case "RATING":
      return ["RATING_DISTRIBUTION", "NUMBER_SUMMARY"];
    case "SCALE":
      return ["SCALE_DISTRIBUTION", "NUMBER_SUMMARY"];
    case "NUMBER":
      return ["NUMBER_SUMMARY"];
    case "SINGLE_CHOICE":
      return ["OPTION_DISTRIBUTION", "SEGMENT_DISTRIBUTION"];
    case "DROPDOWN":
      return ["SEGMENT_DISTRIBUTION", "OPTION_DISTRIBUTION"];
    case "MULTIPLE_CHOICE":
      return ["MULTI_SELECT_FREQUENCY"];
    case "YES_NO":
      return ["YES_NO_DISTRIBUTION"];
    case "SHORT_TEXT":
      return ["TEXT_RESPONSES", "THEME_CLUSTER"];
    case "LONG_TEXT":
      return ["THEME_CLUSTER", "TEXT_RESPONSES"];
  }
}

export function isChoiceType(type: QuestionType): boolean {
  return type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE" || type === "DROPDOWN";
}

export function isNumericType(type: QuestionType): boolean {
  return type === "RATING" || type === "SCALE" || type === "NUMBER";
}

export function isTextType(type: QuestionType): boolean {
  return type === "SHORT_TEXT" || type === "LONG_TEXT";
}

export function defaultValidation(type: QuestionType): ValidationRules {
  switch (type) {
    case "RATING":
      return { min: 1, max: 5 };
    case "SCALE":
      return { min: 0, max: 10 };
    case "SHORT_TEXT":
      return { maxLength: 300 };
    case "LONG_TEXT":
      return { maxLength: 3000 };
    case "MULTIPLE_CHOICE":
      return { minSelections: 1 };
    default:
      return {};
  }
}

export const DEFAULT_ANALYTICS_META: AnalyticsMeta = {
  displayPriority: 100,
  showInSummary: true,
};

/** Rough completion-time estimate (PRD §20, §24). */
export function estimateMinutes(questions: Pick<QuestionDefinition, "type">[]): number {
  const seconds = questions.reduce((total, q) => {
    switch (q.type) {
      case "LONG_TEXT":
        return total + 60;
      case "SHORT_TEXT":
        return total + 30;
      case "MULTIPLE_CHOICE":
        return total + 20;
      default:
        return total + 12;
    }
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

/** Typed answer values, one variant per storage column (PRD §61). */
export type AnswerValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "json"; value: string[] };

export function describeAnswer(q: QuestionDefinition, a: AnswerValue | null): string {
  if (!a) return "";
  switch (a.kind) {
    case "boolean":
      return a.value ? "Yes" : "No";
    case "number":
      return String(a.value);
    case "text": {
      const opt = q.options.find((o) => o.value === a.value);
      return opt ? opt.label : a.value;
    }
    case "json":
      return a.value
        .map((v) => q.options.find((o) => o.value === v)?.label ?? v)
        .join(", ");
  }
}
