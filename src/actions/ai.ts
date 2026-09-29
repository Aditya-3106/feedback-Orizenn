"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/api/errors";
import { requireActor } from "@/lib/auth/session";
import { generateInsights, generateQuestionSuggestions } from "@/lib/ai/service";
import type { InsightResult, QuestionReviewResult, QuestionSuggestion } from "@/lib/ai/types";
import { analyticsFiltersSchema } from "@/lib/validation/filters";

export async function generateQuestionsAction(
  versionId: string,
  goal: string,
  count = 6,
): Promise<ActionResult<{ suggestions: QuestionSuggestion[]; review: QuestionReviewResult }>> {
  return runAction(async () => {
    const actor = await requireActor("ai:use");
    const { suggestions, review } = await generateQuestionSuggestions(actor, versionId, goal, count);
    return { suggestions, review };
  });
}

export async function generateInsightsAction(
  campaignId: string,
  rawFilters: Record<string, string | undefined>,
): Promise<ActionResult<{ insight: InsightResult }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("ai:use");
    const filters = analyticsFiltersSchema.safeParse(rawFilters);
    const { insight } = await generateInsights(actor, campaignId, filters.success ? filters.data : {});
    return { insight };
  });
  revalidatePath(`/admin/campaigns/${campaignId}/analytics`);
  return result;
}
