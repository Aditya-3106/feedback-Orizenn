"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, runAction, type ActionResult, type FieldErrors } from "@/lib/api/errors";
import { parseOrThrow } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  setCampaignStatus,
  updateCampaign,
} from "@/lib/campaigns/service";
import { campaignInputFromFormData, campaignInputSchema, campaignStatusSchema } from "@/lib/validation/campaign";

export interface CampaignFormState {
  error?: string;
  fields?: FieldErrors;
  values?: Record<string, unknown>;
}

/** Create a campaign from the /admin/campaigns/new form, then go pick a form source. */
export async function createCampaignAction(_prev: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  const raw = campaignInputFromFormData(formData);
  let id: string;
  try {
    const actor = await requireActor("campaign:create");
    const input = parseOrThrow(campaignInputSchema, raw);
    const campaign = await createCampaign(actor, input);
    id = campaign.id;
  } catch (err) {
    const r = fail(err);
    return { error: r.success ? undefined : r.error.message, fields: r.success ? undefined : r.error.fields, values: raw as Record<string, unknown> };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${id}/source`);
}

export async function updateCampaignAction(campaignId: string, _prev: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  const raw = campaignInputFromFormData(formData);
  try {
    const actor = await requireActor("campaign:edit");
    const input = parseOrThrow(campaignInputSchema, raw);
    await updateCampaign(actor, campaignId, input);
  } catch (err) {
    const r = fail(err);
    return { error: r.success ? undefined : r.error.message, fields: r.success ? undefined : r.error.fields, values: raw as Record<string, unknown> };
  }
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath("/admin/campaigns");
  return { values: raw as Record<string, unknown>, error: undefined, fields: undefined };
}

export async function setCampaignStatusAction(campaignId: string, status: string): Promise<ActionResult<{ status: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("campaign:publish");
    const next = parseOrThrow(campaignStatusSchema, status);
    const c = await setCampaignStatus(actor, campaignId, next);
    return { status: c.status };
  });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin");
  return result;
}

export async function duplicateCampaignAction(campaignId: string): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(async () => {
    const actor = await requireActor("campaign:create");
    const c = await duplicateCampaign(actor, campaignId);
    return { id: c.id };
  });
  revalidatePath("/admin/campaigns");
  return result;
}

export async function deleteCampaignAction(campaignId: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("campaign:delete");
    await deleteCampaign(actor, campaignId);
    return null;
  });
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin");
  return result;
}
