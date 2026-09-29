import type { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_ANALYTICS_META,
  type AnalyticsMeta,
  type FormDefinition,
  type QuestionDefinition,
  type RespondentField,
  type ValidationRules,
} from "./definitions";

export const questionInclude = {
  options: { orderBy: { position: "asc" } },
} satisfies Prisma.QuestionInclude;

export const formVersionInclude = {
  questions: { include: questionInclude, orderBy: { position: "asc" } },
  campaign: true,
} satisfies Prisma.FormVersionInclude;

export type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;
export type FormVersionRow = Prisma.FormVersionGetPayload<{ include: typeof formVersionInclude }>;

function asRules(json: Prisma.JsonValue | null): ValidationRules {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const o = json as Record<string, unknown>;
  const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
  return {
    min: num("min"),
    max: num("max"),
    minLength: num("minLength"),
    maxLength: num("maxLength"),
    minSelections: num("minSelections"),
    maxSelections: num("maxSelections"),
  };
}

function asMeta(json: Prisma.JsonValue | null): AnalyticsMeta {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ...DEFAULT_ANALYTICS_META };
  const o = json as Record<string, unknown>;
  return {
    displayPriority:
      typeof o.displayPriority === "number" ? o.displayPriority : DEFAULT_ANALYTICS_META.displayPriority,
    showInSummary:
      typeof o.showInSummary === "boolean" ? o.showInSummary : DEFAULT_ANALYTICS_META.showInSummary,
  };
}

export function toQuestionDefinition(row: QuestionRow): QuestionDefinition {
  return {
    id: row.id,
    key: row.key,
    position: row.position,
    text: row.text,
    description: row.description,
    type: row.type,
    required: row.required,
    category: row.category,
    analyticsType: row.analyticsType,
    comparableKey: row.comparableKey,
    validation: asRules(row.validationJson),
    analytics: asMeta(row.analyticsJson),
    options: row.options.map((o) => ({ id: o.id, label: o.label, value: o.value, position: o.position })),
  };
}

export function toFormDefinition(version: FormVersionRow): FormDefinition {
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    introText: version.introText,
    estimatedMinutes: version.estimatedMinutes,
    campaign: {
      id: version.campaign.id,
      name: version.campaign.name,
      responseMode: version.campaign.responseMode,
      respondentFields: version.campaign.respondentFields as RespondentField[],
      requireQuoteConsent: version.campaign.requireQuoteConsent,
      allowMultipleResponses: version.campaign.allowMultipleResponses,
    },
    questions: version.questions.map(toQuestionDefinition),
  };
}
