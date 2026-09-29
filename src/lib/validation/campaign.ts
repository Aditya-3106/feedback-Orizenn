import { z } from "zod";
import { CAMPAIGN_STATUSES, RESPONDENT_FIELDS, RESPONSE_MODES } from "@/lib/forms/definitions";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

const optionalTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((v) => v || undefined)
    .optional();

const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.date({ error: "Enter a valid date." }).optional(),
);

const optionalPositiveInt = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .positive("Must be greater than zero.")
    .optional(),
);

const checkbox = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1",
  z.boolean(),
);

/** PRD §12, §30, §75 */
export const campaignInputSchema = z
  .object({
    name: trimmed(2, 100, "Campaign name"),
    description: optionalTrimmed(1000, "Description"),
    goal: trimmed(10, 1000, "Goal"),
    targetAudience: optionalTrimmed(200, "Target audience"),
    responseMode: z.enum(RESPONSE_MODES).default("PSEUDONYMOUS"),
    allowMultipleResponses: checkbox.default(false),
    requireQuoteConsent: checkbox.default(false),
    respondentFields: z
      .array(z.enum(RESPONDENT_FIELDS))
      .max(RESPONDENT_FIELDS.length)
      .default([]),
    startsAt: optionalDate,
    endsAt: optionalDate,
    maxResponses: optionalPositiveInt,
  })
  .superRefine((data, ctx) => {
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Close date must be after the start date.",
      });
    }
    if (data.responseMode === "ANONYMOUS") {
      const identifying = data.respondentFields.filter((f) => f === "name" || f === "email");
      if (identifying.length) {
        ctx.addIssue({
          code: "custom",
          path: ["respondentFields"],
          message: "Anonymous campaigns cannot collect name or email.",
        });
      }
    }
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);

export const campaignSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: campaignStatusSchema.optional(),
  includeArchived: z.boolean().default(false),
});

/** Convert a FormData object into a plain object the campaign schema accepts. */
export function campaignInputFromFormData(fd: FormData): unknown {
  return {
    name: fd.get("name"),
    description: fd.get("description") ?? undefined,
    goal: fd.get("goal"),
    targetAudience: fd.get("targetAudience") ?? undefined,
    responseMode: fd.get("responseMode") ?? undefined,
    allowMultipleResponses: fd.get("allowMultipleResponses"),
    requireQuoteConsent: fd.get("requireQuoteConsent"),
    respondentFields: fd.getAll("respondentFields"),
    startsAt: fd.get("startsAt") ?? undefined,
    endsAt: fd.get("endsAt") ?? undefined,
    maxResponses: fd.get("maxResponses") ?? undefined,
  };
}
