"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/api/errors";
import { parseOrThrow } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import type { QuestionDefinition } from "@/lib/forms/definitions";
import {
  addQuestion,
  addQuestions,
  deleteQuestion,
  duplicateQuestion,
  reorderQuestions,
  updateQuestion,
} from "@/lib/questions/service";
import { questionDraftSchema, type QuestionDraftInput } from "@/lib/validation/question";
import { z } from "zod";

export async function addQuestionAction(versionId: string, campaignId: string, draft: QuestionDraftInput): Promise<ActionResult<QuestionDefinition>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    const parsed = parseOrThrow(questionDraftSchema, draft);
    return addQuestion(actor, versionId, parsed);
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

export async function addQuestionsAction(versionId: string, campaignId: string, drafts: QuestionDraftInput[]): Promise<ActionResult<QuestionDefinition[]>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    const parsed = parseOrThrow(z.array(questionDraftSchema).min(1).max(20), drafts);
    return addQuestions(actor, versionId, parsed);
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

export async function updateQuestionAction(questionId: string, campaignId: string, draft: QuestionDraftInput): Promise<ActionResult<QuestionDefinition>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    const parsed = parseOrThrow(questionDraftSchema, draft);
    return updateQuestion(actor, questionId, parsed);
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

export async function deleteQuestionAction(questionId: string, campaignId: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    await deleteQuestion(actor, questionId);
    return null;
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

export async function duplicateQuestionAction(questionId: string, campaignId: string): Promise<ActionResult<QuestionDefinition>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    return duplicateQuestion(actor, questionId);
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

export async function reorderQuestionsAction(versionId: string, campaignId: string, orderedIds: string[]): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    await reorderQuestions(actor, versionId, orderedIds);
    return null;
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}
