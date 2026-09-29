import { z } from "zod";
import type { AnswerValue, FormDefinition, QuestionDefinition } from "@/lib/forms/definitions";
import type { FieldErrors } from "@/lib/api/errors";

/** Wire shape posted by the public form (PRD §78–79). */
export const submissionPayloadSchema = z.object({
  clientToken: z.string().trim().min(8).max(64),
  startedAt: z.string().datetime().optional(),
  /** Honeypot: humans leave it empty; bots fill it in. Parsed leniently so the service can silently swallow it. */
  website: z.string().max(500).optional().default(""),
  respondent: z
    .object({
      name: z.string().trim().max(120).optional(),
      email: z
        .string()
        .trim()
        .max(200)
        .optional()
        .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Enter a valid email." }),
      college: z.string().trim().max(160).optional(),
      branch: z.string().trim().max(120).optional(),
      year: z.string().trim().max(40).optional(),
      projectType: z.string().trim().max(120).optional(),
    })
    .default({}),
  consentToQuote: z.boolean().optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

export interface ValidatedAnswer {
  questionId: string;
  value: AnswerValue;
}

export interface AnswerValidationResult {
  ok: boolean;
  answers: ValidatedAnswer[];
  errors: FieldErrors;
}

function isBlank(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    (typeof v === "string" && v.trim() === "") ||
    (Array.isArray(v) && v.length === 0)
  );
}

/**
 * Validate one raw answer against its question definition. The server never
 * trusts the client's question schema: `q` comes from the database.
 */
export function validateAnswer(q: QuestionDefinition, raw: unknown): { value?: AnswerValue; error?: string } {
  if (isBlank(raw)) {
    return q.required ? { error: "This question is required." } : {};
  }
  const rules = q.validation ?? {};

  switch (q.type) {
    case "RATING":
    case "SCALE":
    case "NUMBER": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { error: "Enter a number." };
      if (q.type !== "NUMBER" && !Number.isInteger(n)) return { error: "Choose one of the options." };
      const min = rules.min ?? (q.type === "RATING" ? 1 : q.type === "SCALE" ? 0 : undefined);
      const max = rules.max ?? (q.type === "RATING" ? 5 : q.type === "SCALE" ? 10 : undefined);
      if (min != null && n < min) return { error: `Must be at least ${min}.` };
      if (max != null && n > max) return { error: `Must be at most ${max}.` };
      return { value: { kind: "number", value: n } };
    }

    case "YES_NO": {
      if (typeof raw === "boolean") return { value: { kind: "boolean", value: raw } };
      const s = String(raw).trim().toLowerCase();
      if (s === "true" || s === "yes") return { value: { kind: "boolean", value: true } };
      if (s === "false" || s === "no") return { value: { kind: "boolean", value: false } };
      return { error: "Choose yes or no." };
    }

    case "SINGLE_CHOICE":
    case "DROPDOWN": {
      const s = String(raw).trim();
      if (!q.options.some((o) => o.value === s)) return { error: "Choose one of the options." };
      return { value: { kind: "text", value: s } };
    }

    case "MULTIPLE_CHOICE": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const unique = Array.from(new Set(arr.map((v) => v.trim()).filter(Boolean)));
      if (!unique.every((v) => q.options.some((o) => o.value === v))) {
        return { error: "One of the selected options is invalid." };
      }
      const minSel = rules.minSelections ?? (q.required ? 1 : 0);
      if (unique.length < minSel) return { error: `Select at least ${minSel}.` };
      if (rules.maxSelections != null && unique.length > rules.maxSelections) {
        return { error: `Select at most ${rules.maxSelections}.` };
      }
      // Preserve option order for stable analytics/export output.
      const ordered = q.options.filter((o) => unique.includes(o.value)).map((o) => o.value);
      return { value: { kind: "json", value: ordered } };
    }

    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const s = String(raw).replace(/\r\n/g, "\n").trim();
      const cap = rules.maxLength ?? (q.type === "SHORT_TEXT" ? 300 : 3000);
      if (rules.minLength != null && s.length < rules.minLength) {
        return { error: `Please write at least ${rules.minLength} characters.` };
      }
      if (s.length > cap) return { error: `Please keep it under ${cap} characters.` };
      return { value: { kind: "text", value: s } };
    }
  }
}

/**
 * Validate a complete set of answers against the published form definition.
 * Unknown question ids are rejected (tampering guard, PRD §79).
 */
export function validateAnswers(
  form: Pick<FormDefinition, "questions">,
  rawAnswers: Record<string, unknown>,
): AnswerValidationResult {
  const errors: FieldErrors = {};
  const answers: ValidatedAnswer[] = [];
  const allowed = new Set(form.questions.map((q) => q.id));

  for (const id of Object.keys(rawAnswers)) {
    if (!allowed.has(id)) {
      errors[`answers.${id}`] = ["Unknown question."];
    }
  }

  for (const q of form.questions) {
    const { value, error } = validateAnswer(q, rawAnswers[q.id]);
    if (error) {
      errors[`answers.${q.id}`] = [error];
    } else if (value) {
      answers.push({ questionId: q.id, value });
    }
  }

  return { ok: Object.keys(errors).length === 0, answers, errors };
}

/** Which respondent fields must be present given the campaign's configuration. */
export function validateRespondentContext(
  form: Pick<FormDefinition, "campaign">,
  respondent: SubmissionPayload["respondent"],
): FieldErrors {
  const errors: FieldErrors = {};
  const fields = form.campaign.respondentFields;
  if (form.campaign.responseMode === "ANONYMOUS") {
    // Never accept identity in an anonymous campaign, regardless of client.
    return errors;
  }
  for (const f of fields) {
    if (f === "email" || f === "projectType") continue; // optional context
    if (isBlank(respondent[f])) errors[`respondent.${f}`] = ["This field is required."];
  }
  return errors;
}
