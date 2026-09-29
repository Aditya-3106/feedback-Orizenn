"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/lib/api/errors";
import { requireActor } from "@/lib/auth/session";
import {
  createDraftVersion,
  publishVersion,
  setLinkStatus,
  updateDraftMeta,
  type DraftSource,
  type PublishResult,
} from "@/lib/forms/service";

/** Create a new draft from blank / previous version / template and jump into the builder. */
export async function createDraftAction(campaignId: string, source: DraftSource): Promise<ActionResult<{ versionId: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    const v = await createDraftVersion(actor, campaignId, source);
    return { versionId: v.id };
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

/** Form-action variant used by the "Use this form" buttons (progressive enhancement). */
export async function createDraftFormAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") ?? "");
  const kind = String(formData.get("kind") ?? "blank");
  const source: DraftSource =
    kind === "version"
      ? { kind: "version", versionId: String(formData.get("versionId") ?? "") }
      : kind === "template"
        ? { kind: "template", templateId: String(formData.get("templateId") ?? "") }
        : { kind: "blank" };

  const actor = await requireActor("form:edit");
  const v = await createDraftVersion(actor, campaignId, source);
  revalidatePath(`/admin/campaigns/${campaignId}`);
  redirect(`/admin/campaigns/${campaignId}/builder?version=${v.id}`);
}

export async function publishVersionAction(versionId: string, campaignId: string): Promise<ActionResult<PublishResult>> {
  const result = await runAction(async () => {
    const actor = await requireActor("campaign:publish");
    return publishVersion(actor, versionId);
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin");
  return result;
}

export async function setLinkStatusAction(linkId: string, campaignId: string, status: "ACTIVE" | "PAUSED" | "EXPIRED"): Promise<ActionResult<{ status: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("campaign:publish");
    const link = await setLinkStatus(actor, linkId, status);
    return { status: link.status };
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  return result;
}

export async function updateDraftMetaAction(
  versionId: string,
  campaignId: string,
  data: { introText?: string | null; estimatedMinutes?: number | null },
): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("form:edit");
    await updateDraftMeta(actor, versionId, data);
    return null;
  });
  revalidatePath(`/admin/campaigns/${campaignId}/builder`);
  return result;
}
