import { z } from "zod";
import {
  ANALYTICS_TYPES,
  QUESTION_TYPES,
  allowedAnalyticsTypes,
  isChoiceType,
  type QuestionType,
} from "@/lib/forms/definitions";

export const optionInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Option label is required.").max(200),
  value: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_\-]+$/i, "Option value may only contain letters, numbers, _ and -.")
    .optional(),
});

export const validationRulesSchema = z
  .object({
    min: z.coerce.number().optional(),
    max: z.coerce.number().optional(),
    minLength: z.coerce.number().int().min(0).optional(),
    maxLength: z.coerce.number().int().min(1).optional(),
    minSelections: z.coerce.number().int().min(0).optional(),
    maxSelections: z.coerce.number().int().min(1).optional(),
  })
  .partial();

export const analyticsMetaSchema = z.object({
  displayPriority: z.coerce.number().int().min(0).max(1000).default(100),
  showInSummary: z.boolean().default(true),
});

const comparableKey = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9_]*$/, "Use lowercase letters, numbers and underscores.")
  .transform((v) => v || undefined)
  .optional();

/** A question as authored in the builder or returned by AI (PRD §76, §91). */
export const questionDraftSchema = z
  .object({
    text: z.string().trim().min(3, "Question text must be at least 3 characters.").max(500),
    description: z.string().trim().max(1000).transform((v) => v || undefined).optional(),
    type: z.enum(QUESTION_TYPES),
    required: z.boolean().default(true),
    category: z.string().trim().max(60).transform((v) => v || undefined).optional(),
    analyticsType: z.enum(ANALYTICS_TYPES).optional(),
    comparableKey,
    validation: validationRulesSchema.default({}),
    analytics: analyticsMetaSchema.default({ displayPriority: 100, showInSummary: true }),
    options: z.array(optionInputSchema).max(20, "At most 20 options.").default([]),
  })
  .superRefine((q, ctx) => {
    if (isChoiceType(q.type)) {
      if (q.options.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Choice questions need at least 2 options.",
        });
      }
      const seen = new Set<string>();
      q.options.forEach((o, i) => {
        const v = (o.value ?? o.label).toLowerCase();
        if (seen.has(v)) {
          ctx.addIssue({ code: "custom", path: ["options", i], message: "Duplicate option." });
        }
        seen.add(v);
      });
    } else if (q.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Only choice questions can have options.",
      });
    }

    if (q.type === "RATING") {
      const min = q.validation.min ?? 1;
      const max = q.validation.max ?? 5;
      if (min < 1) ctx.addIssue({ code: "custom", path: ["validation", "min"], message: "Rating minimum must be at least 1." });
      if (max > 10) ctx.addIssue({ code: "custom", path: ["validation", "max"], message: "Rating maximum must be at most 10." });
      if (max <= min) ctx.addIssue({ code: "custom", path: ["validation", "max"], message: "Maximum must be greater than minimum." });
    }

    if (q.type === "SCALE") {
      const min = q.validation.min ?? 0;
      const max = q.validation.max ?? 10;
      if (max - min < 2) ctx.addIssue({ code: "custom", path: ["validation", "max"], message: "A scale needs at least 3 points." });
      if (max - min > 100) ctx.addIssue({ code: "custom", path: ["validation", "max"], message: "A scale can have at most 101 points." });
    }

    if (q.type === "NUMBER" && q.validation.min != null && q.validation.max != null && q.validation.max < q.validation.min) {
      ctx.addIssue({ code: "custom", path: ["validation", "max"], message: "Maximum must be at least the minimum." });
    }

    if ((q.type === "SHORT_TEXT" || q.type === "LONG_TEXT")) {
      const cap = q.type === "SHORT_TEXT" ? 500 : 3000;
      if ((q.validation.maxLength ?? 0) > cap) {
        ctx.addIssue({ code: "custom", path: ["validation", "maxLength"], message: `Maximum length can be at most ${cap}.` });
      }
      if (q.validation.minLength != null && q.validation.maxLength != null && q.validation.minLength > q.validation.maxLength) {
        ctx.addIssue({ code: "custom", path: ["validation", "minLength"], message: "Minimum length exceeds maximum." });
      }
    }

    if (q.type === "MULTIPLE_CHOICE" && q.validation.maxSelections != null && q.validation.maxSelections > Math.max(q.options.length, 1)) {
      ctx.addIssue({ code: "custom", path: ["validation", "maxSelections"], message: "Cannot require more selections than options." });
    }

    if (q.analyticsType && !allowedAnalyticsTypes(q.type).includes(q.analyticsType)) {
      ctx.addIssue({
        code: "custom",
        path: ["analyticsType"],
        message: `That analytics type does not apply to ${q.type} questions.`,
      });
    }
  });

export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export type QuestionDraftInput = z.input<typeof questionDraftSchema>;

export const reorderSchema = z.object({
  formVersionId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const questionTypeSchema = z.enum(QUESTION_TYPES);

export function isQuestionType(v: unknown): v is QuestionType {
  return typeof v === "string" && (QUESTION_TYPES as readonly string[]).includes(v);
}
