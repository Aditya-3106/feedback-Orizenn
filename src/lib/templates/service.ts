import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { audit } from "@/lib/audit/log";
import { definitionToDraft } from "@/lib/forms/clone";
import { toQuestionDefinition } from "@/lib/forms/mapper";
import { getVersionForActor } from "@/lib/forms/service";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import { questionDraftSchema, type QuestionDraft } from "@/lib/validation/question";

export async function listTemplates(actor: Actor, includeArchived = false) {
  assertPermission(actor.role, "campaign:view");
  return prisma.formTemplate.findMany({
    where: { workspaceId: actor.workspaceId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: [{ archived: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getTemplate(actor: Actor, templateId: string) {
  assertPermission(actor.role, "campaign:view");
  const tpl = await prisma.formTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new NotFoundError("Template");
  assertSameWorkspace(actor, tpl.workspaceId);
  return tpl;
}

export function templateQuestions(json: Prisma.JsonValue): QuestionDraft[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => questionDraftSchema.parse(raw));
}

/** Save the questions of a version as a reusable template (PRD §22). */
export async function saveVersionAsTemplate(actor: Actor, versionId: string, name: string, description?: string) {
  assertPermission(actor.role, "templates:manage");
  if (name.trim().length < 2) throw new ValidationError({ name: ["Template name must be at least 2 characters."] });
  const version = await getVersionForActor(actor, versionId);
  if (!version.questions.length) throw new ValidationError({ questions: ["Add at least one question before saving a template."] });
  const drafts = version.questions.map(toQuestionDefinition).map(definitionToDraft);

  return prisma.$transaction(async (tx) => {
    const tpl = await tx.formTemplate.create({
      data: {
        workspaceId: actor.workspaceId,
        name: name.trim(),
        description: description?.trim() || null,
        questionsJson: JSON.parse(JSON.stringify(drafts)) as Prisma.InputJsonValue,
      },
    });
    await audit(tx, actor, { action: "TEMPLATE_CREATED", entityType: "FormTemplate", entityId: tpl.id, metadata: { versionId } });
    return tpl;
  });
}

export async function duplicateTemplate(actor: Actor, templateId: string) {
  assertPermission(actor.role, "templates:manage");
  const tpl = await getTemplate(actor, templateId);
  return prisma.formTemplate.create({
    data: {
      workspaceId: actor.workspaceId,
      name: `${tpl.name} (copy)`,
      description: tpl.description,
      questionsJson: tpl.questionsJson as Prisma.InputJsonValue,
    },
  });
}

export async function setTemplateArchived(actor: Actor, templateId: string, archived: boolean) {
  assertPermission(actor.role, "templates:manage");
  const tpl = await getTemplate(actor, templateId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.formTemplate.update({ where: { id: tpl.id }, data: { archived } });
    await audit(tx, actor, { action: "TEMPLATE_UPDATED", entityType: "FormTemplate", entityId: tpl.id, metadata: { archived } });
    return updated;
  });
}

export async function renameTemplate(actor: Actor, templateId: string, name: string, description?: string) {
  assertPermission(actor.role, "templates:manage");
  if (name.trim().length < 2) throw new ValidationError({ name: ["Template name must be at least 2 characters."] });
  const tpl = await getTemplate(actor, templateId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.formTemplate.update({
      where: { id: tpl.id },
      data: { name: name.trim(), description: description?.trim() || null },
    });
    await audit(tx, actor, { action: "TEMPLATE_UPDATED", entityType: "FormTemplate", entityId: tpl.id });
    return updated;
  });
}
