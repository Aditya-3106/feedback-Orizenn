import { prisma } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { audit } from "@/lib/audit/log";
import { questionDraftToCreateData, questionDraftToUpdateData, optionValueFromLabel } from "@/lib/forms/clone";
import { isChoiceType, type QuestionDefinition } from "@/lib/forms/definitions";
import { questionInclude, toQuestionDefinition } from "@/lib/forms/mapper";
import { assertDraft, getVersionForActor } from "@/lib/forms/service";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import type { QuestionDraft } from "@/lib/validation/question";

async function loadEditableQuestion(actor: Actor, questionId: string) {
  assertPermission(actor.role, "form:edit");
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      ...questionInclude,
      formVersion: { include: { campaign: { select: { workspaceId: true } } } },
    },
  });
  if (!q) throw new NotFoundError("Question");
  assertSameWorkspace(actor, q.formVersion.campaign.workspaceId);
  assertDraft(q.formVersion);
  return q;
}

export async function addQuestion(actor: Actor, versionId: string, draft: QuestionDraft): Promise<QuestionDefinition> {
  assertPermission(actor.role, "form:edit");
  const version = await getVersionForActor(actor, versionId);
  assertDraft(version);

  const data = questionDraftToCreateData(
    draft,
    version.questions.length,
    version.questions.map((q) => q.key),
  );

  return prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: { ...data, formVersionId: version.id },
      include: questionInclude,
    });
    await audit(tx, actor, {
      action: "QUESTION_ADDED",
      entityType: "Question",
      entityId: created.id,
      metadata: { versionId: version.id, type: created.type },
    });
    return toQuestionDefinition(created);
  });
}

/** Bulk insert (AI suggestions, library) at the end of the draft. */
export async function addQuestions(actor: Actor, versionId: string, drafts: QuestionDraft[]): Promise<QuestionDefinition[]> {
  assertPermission(actor.role, "form:edit");
  const version = await getVersionForActor(actor, versionId);
  assertDraft(version);

  const keys = version.questions.map((q) => q.key);
  const payloads = drafts.map((d, i) => {
    const data = questionDraftToCreateData(d, version.questions.length + i, keys);
    keys.push(data.key);
    return data;
  });

  return prisma.$transaction(async (tx) => {
    const created: QuestionDefinition[] = [];
    for (const data of payloads) {
      const row = await tx.question.create({
        data: { ...data, formVersionId: version.id },
        include: questionInclude,
      });
      created.push(toQuestionDefinition(row));
      await audit(tx, actor, {
        action: "QUESTION_ADDED",
        entityType: "Question",
        entityId: row.id,
        metadata: { versionId: version.id, type: row.type, bulk: true },
      });
    }
    return created;
  });
}

export async function updateQuestion(actor: Actor, questionId: string, draft: QuestionDraft): Promise<QuestionDefinition> {
  const existing = await loadEditableQuestion(actor, questionId);

  // Options are replaced wholesale; keep ids for unchanged values so answers
  // referencing option values remain interpretable (drafts have no answers anyway).
  const taken = new Set<string>();
  const nextOptions = isChoiceType(draft.type)
    ? draft.options.map((o, i) => ({
        label: o.label,
        value: o.value ? o.value.toLowerCase() : optionValueFromLabel(o.label, taken),
        position: i,
      }))
    : [];
  const seen = new Set<string>();
  for (const o of nextOptions) {
    if (seen.has(o.value)) {
      throw new ValidationError({ options: [`Duplicate option value "${o.value}".`] });
    }
    seen.add(o.value);
  }

  return prisma.$transaction(async (tx) => {
    await tx.questionOption.deleteMany({ where: { questionId: existing.id } });
    const updated = await tx.question.update({
      where: { id: existing.id },
      data: {
        ...questionDraftToUpdateData(draft),
        options: nextOptions.length ? { create: nextOptions } : undefined,
      },
      include: questionInclude,
    });
    await audit(tx, actor, {
      action: "QUESTION_EDITED",
      entityType: "Question",
      entityId: updated.id,
      metadata: { versionId: existing.formVersionId },
    });
    return toQuestionDefinition(updated);
  });
}

export async function deleteQuestion(actor: Actor, questionId: string): Promise<void> {
  const existing = await loadEditableQuestion(actor, questionId);
  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: existing.id } });
    await normalizePositions(tx, existing.formVersionId);
    await audit(tx, actor, {
      action: "QUESTION_DELETED",
      entityType: "Question",
      entityId: existing.id,
      metadata: { versionId: existing.formVersionId },
    });
  });
}

export async function duplicateQuestion(actor: Actor, questionId: string): Promise<QuestionDefinition> {
  const existing = await loadEditableQuestion(actor, questionId);
  const siblings = await prisma.question.findMany({
    where: { formVersionId: existing.formVersionId },
    select: { key: true },
  });
  const def = toQuestionDefinition(existing);
  const data = questionDraftToCreateData(
    {
      text: def.text,
      description: def.description ?? undefined,
      type: def.type,
      required: def.required,
      category: def.category ?? undefined,
      analyticsType: def.analyticsType,
      comparableKey: undefined, // a copy must not silently share a comparable key
      validation: def.validation,
      analytics: def.analytics,
      options: def.options.map((o) => ({ label: o.label, value: o.value })),
    },
    existing.position + 1,
    siblings.map((s) => s.key),
  );

  return prisma.$transaction(async (tx) => {
    // Shift following questions down by one.
    await tx.question.updateMany({
      where: { formVersionId: existing.formVersionId, position: { gt: existing.position } },
      data: { position: { increment: 1 } },
    });
    const created = await tx.question.create({
      data: { ...data, formVersionId: existing.formVersionId },
      include: questionInclude,
    });
    await audit(tx, actor, {
      action: "QUESTION_ADDED",
      entityType: "Question",
      entityId: created.id,
      metadata: { versionId: existing.formVersionId, duplicatedFrom: existing.id },
    });
    return toQuestionDefinition(created);
  });
}

/** Persist a new order given the full list of question ids (PRD §18). */
export async function reorderQuestions(actor: Actor, versionId: string, orderedIds: string[]): Promise<void> {
  assertPermission(actor.role, "form:edit");
  const version = await getVersionForActor(actor, versionId);
  assertDraft(version);

  const current = new Set(version.questions.map((q) => q.id));
  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length || unique.size !== current.size || ![...unique].every((id) => current.has(id))) {
    throw new ValidationError({ orderedIds: ["The order must include every question exactly once."] });
  }

  await prisma.$transaction(async (tx) => {
    // Two-phase update avoids transient unique collisions if a unique index is later added on position.
    for (const [i, id] of orderedIds.entries()) {
      await tx.question.update({ where: { id }, data: { position: 10_000 + i } });
    }
    for (const [i, id] of orderedIds.entries()) {
      await tx.question.update({ where: { id }, data: { position: i } });
    }
    await audit(tx, actor, {
      action: "QUESTIONS_REORDERED",
      entityType: "FormVersion",
      entityId: version.id,
    });
  });
}

async function normalizePositions(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  formVersionId: string,
) {
  const rows = await tx.question.findMany({
    where: { formVersionId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  for (const [i, r] of rows.entries()) {
    if (r.position !== i) await tx.question.update({ where: { id: r.id }, data: { position: i } });
  }
}
