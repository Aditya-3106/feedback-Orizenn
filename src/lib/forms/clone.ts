import type { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_ANALYTICS_META,
  defaultAnalyticsType,
  defaultValidation,
  isChoiceType,
  type QuestionDefinition,
} from "./definitions";
import type { QuestionDraft } from "@/lib/validation/question";
import { generateQuestionKey, slugify } from "@/lib/utils/slug";

/** Nested-create payload for one question under a FormVersion. */
export type QuestionCreateData = Omit<Prisma.QuestionCreateWithoutFormVersionInput, "options"> & {
  options?: { create: Array<{ label: string; value: string; position: number }> };
};

function toJson(value: object | undefined): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  const cleaned = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  return Object.keys(cleaned).length ? (cleaned as Prisma.InputJsonValue) : undefined;
}

/**
 * Produce create payloads that reproduce `questions` exactly (keys, positions,
 * metadata and options) but with fresh ids. The source is never mutated.
 * (PRD §14, §52, §108 "Form cloning".)
 */
export function cloneQuestionsData(questions: readonly QuestionDefinition[]): QuestionCreateData[] {
  return [...questions]
    .sort((a, b) => a.position - b.position)
    .map((q, index) => ({
      key: q.key,
      position: index,
      text: q.text,
      description: q.description ?? undefined,
      type: q.type,
      required: q.required,
      category: q.category ?? undefined,
      analyticsType: q.analyticsType,
      comparableKey: q.comparableKey ?? undefined,
      validationJson: toJson(q.validation),
      analyticsJson: toJson(q.analytics),
      options: q.options.length
        ? {
            create: [...q.options]
              .sort((a, b) => a.position - b.position)
              .map((o, i) => ({ label: o.label, value: o.value, position: i })),
          }
        : undefined,
    }));
}

/** Derive a stable option value from its label when the author did not supply one. */
export function optionValueFromLabel(label: string, taken: Set<string>): string {
  const base = slugify(label, 40).replace(/-/g, "_") || "option";
  let v = base;
  let i = 2;
  while (taken.has(v)) v = `${base}_${i++}`;
  taken.add(v);
  return v;
}

/** Convert an authored/AI draft into a create payload at `position`. */
export function questionDraftToCreateData(
  draft: QuestionDraft,
  position: number,
  existingKeys: Iterable<string> = [],
): QuestionCreateData {
  const taken = new Set<string>();
  const options = isChoiceType(draft.type)
    ? draft.options.map((o, i) => ({
        label: o.label,
        value: o.value ? o.value.toLowerCase() : optionValueFromLabel(o.label, taken),
        position: i,
      }))
    : [];
  // Guard against explicit duplicates in a case-insensitive way.
  const seen = new Set<string>();
  for (const o of options) {
    if (seen.has(o.value)) o.value = optionValueFromLabel(o.label, seen);
    seen.add(o.value);
  }

  const validation = { ...defaultValidation(draft.type), ...draft.validation };

  return {
    key: generateQuestionKey(draft.text, existingKeys),
    position,
    text: draft.text,
    description: draft.description ?? undefined,
    type: draft.type,
    required: draft.required,
    category: draft.category ?? undefined,
    analyticsType: draft.analyticsType ?? defaultAnalyticsType(draft.type),
    comparableKey: draft.comparableKey ?? undefined,
    validationJson: toJson(validation),
    analyticsJson: toJson(draft.analytics ?? DEFAULT_ANALYTICS_META),
    options: options.length ? { create: options } : undefined,
  };
}

/** Update payload for an existing question (options are replaced wholesale by the service). */
export function questionDraftToUpdateData(draft: QuestionDraft): Prisma.QuestionUpdateInput {
  const validation = { ...defaultValidation(draft.type), ...draft.validation };
  return {
    text: draft.text,
    description: draft.description ?? null,
    type: draft.type,
    required: draft.required,
    category: draft.category ?? null,
    analyticsType: draft.analyticsType ?? defaultAnalyticsType(draft.type),
    comparableKey: draft.comparableKey ?? null,
    validationJson: toJson(validation) ?? {},
    analyticsJson: toJson(draft.analytics ?? DEFAULT_ANALYTICS_META) ?? {},
  };
}

/** Turn a stored definition back into an editable draft (builder + templates). */
export function definitionToDraft(q: QuestionDefinition): QuestionDraft {
  return {
    text: q.text,
    description: q.description ?? undefined,
    type: q.type,
    required: q.required,
    category: q.category ?? undefined,
    analyticsType: q.analyticsType,
    comparableKey: q.comparableKey ?? undefined,
    validation: { ...q.validation },
    analytics: { ...q.analytics },
    options: q.options.map((o) => ({ label: o.label, value: o.value })),
  };
}
