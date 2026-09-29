import { z } from "zod";
import type { AnalyticsDashboard } from "@/lib/analytics/types";
import type { QuestionDefinition } from "@/lib/forms/definitions";
import { questionDraftSchema } from "@/lib/validation/question";

// ───────────────────────── Question generation (PRD §19–§21, §91) ─────────────────────────

export interface QuestionGenerationInput {
  goal: string;
  campaignName: string;
  audience?: string;
  existingQuestions: Array<Pick<QuestionDefinition, "text" | "type" | "category">>;
  count?: number;
}

export const questionSuggestionSchema = questionDraftSchema.safeExtend({
  rationale: z.string().trim().max(400).optional(),
});
export type QuestionSuggestion = z.infer<typeof questionSuggestionSchema>;

export const questionSuggestionsSchema = z
  .array(questionSuggestionSchema)
  .min(1)
  .max(12)
  .superRefine((arr, ctx) => {
    const seen = new Set<string>();
    arr.forEach((q, i) => {
      const norm = q.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(norm)) ctx.addIssue({ code: "custom", path: [i, "text"], message: "Duplicate question." });
      seen.add(norm);
    });
  });

// ───────────────────────── Question review ─────────────────────────

export interface QuestionReviewInput {
  questions: Array<{ index: number; text: string; type: string; options?: string[] }>;
}

export const questionReviewIssueSchema = z.object({
  index: z.number().int().min(0),
  issue: z.enum(["LEADING", "DOUBLE_BARRELED", "JARGON", "ASSUMES_OUTCOME", "EMOTIONAL", "DUPLICATE", "UNCLEAR", "MISSING_OPTIONS"]),
  explanation: z.string().trim().min(1).max(400),
  suggestion: z.string().trim().min(3).max(500).optional(),
});
export const questionReviewResultSchema = z.object({
  issues: z.array(questionReviewIssueSchema).max(50),
});
export type QuestionReviewIssue = z.infer<typeof questionReviewIssueSchema>;
export type QuestionReviewResult = z.infer<typeof questionReviewResultSchema>;

// ───────────────────────── Insights (PRD §42–§43, §92) ─────────────────────────

export interface InsightGenerationInput {
  campaign: { name: string; goal: string };
  dashboard: AnalyticsDashboard;
  /** Actual text responses the model may quote (already consent- and privacy-filtered). */
  quotableResponses: Array<{ questionId: string; text: string }>;
  previousSummary?: string;
}

export const insightResultSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  findings: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(1000),
        kind: z.enum(["POSITIVE", "FRICTION", "THEME", "OPPORTUNITY", "UNEXPECTED", "FINDING"]).default("FINDING"),
        sourceQuestionIds: z.array(z.string()).min(1),
      }),
    )
    .max(12),
  representativeQuotes: z
    .array(z.object({ questionId: z.string(), text: z.string().trim().min(1).max(3000) }))
    .max(8)
    .default([]),
});
export type InsightResult = z.infer<typeof insightResultSchema>;

// ───────────────────────── Themes (PRD §44) ─────────────────────────

export interface ThemeExtractionInput {
  question: Pick<QuestionDefinition, "id" | "text">;
  responses: Array<{ submissionId: string; text: string }>;
  maxThemes?: number;
}

export const themeResultSchema = z.object({
  themes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        keywords: z.array(z.string().trim().min(1)).max(8).default([]),
        submissionIds: z.array(z.string()).min(1),
      }),
    )
    .max(12),
});
export type ThemeResult = z.infer<typeof themeResultSchema>;

// ───────────────────────── Provider interface (PRD §90) ─────────────────────────

export interface AIProvider {
  readonly name: string;
  generateQuestions(input: QuestionGenerationInput): Promise<QuestionSuggestion[]>;
  reviewQuestions(input: QuestionReviewInput): Promise<QuestionReviewResult>;
  generateInsights(input: InsightGenerationInput): Promise<InsightResult>;
  extractThemes(input: ThemeExtractionInput): Promise<ThemeResult>;
}
