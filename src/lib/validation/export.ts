import { z } from "zod";
import { analyticsFiltersSchema } from "./filters";

export const EXPORT_TYPES = [
  "RAW_RESPONSES",
  "STUDENT_DATASET",
  "ANALYTICS_SUMMARY",
  "FULL_WORKBOOK",
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_TYPE_LABELS: Record<ExportType, { title: string; description: string }> = {
  RAW_RESPONSES: {
    title: "Raw responses",
    description: "One row per submission with a column per question.",
  },
  STUDENT_DATASET: {
    title: "Student dataset",
    description: "Respondent context fields and usage status, one row per student.",
  },
  ANALYTICS_SUMMARY: {
    title: "Analytics summary",
    description: "Per-question statistics, distributions and themes.",
  },
  FULL_WORKBOOK: {
    title: "Full workbook",
    description: "Responses, question summary, student data, themes and campaign metadata.",
  },
};

export const exportRequestSchema = z.object({
  type: z.enum(EXPORT_TYPES),
  filters: analyticsFiltersSchema.default({}),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
