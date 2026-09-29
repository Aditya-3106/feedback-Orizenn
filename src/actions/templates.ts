"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/api/errors";
import { requireActor } from "@/lib/auth/session";
import { duplicateTemplate, renameTemplate, saveVersionAsTemplate, setTemplateArchived } from "@/lib/templates/service";

export async function saveAsTemplateAction(versionId: string, name: string, description?: string): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("templates:manage");
    const tpl = await saveVersionAsTemplate(actor, versionId, name, description);
    return { id: tpl.id };
  });
  revalidatePath("/admin/templates");
  return result;
}

export async function duplicateTemplateAction(templateId: string): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("templates:manage");
    const tpl = await duplicateTemplate(actor, templateId);
    return { id: tpl.id };
  });
  revalidatePath("/admin/templates");
  return result;
}

export async function setTemplateArchivedAction(templateId: string, archived: boolean): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("templates:manage");
    await setTemplateArchived(actor, templateId, archived);
    return null;
  });
  revalidatePath("/admin/templates");
  return result;
}

export async function renameTemplateAction(templateId: string, name: string, description?: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("templates:manage");
    await renameTemplate(actor, templateId, name, description);
    return null;
  });
  revalidatePath("/admin/templates");
  return result;
}
