import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicForm } from "@/components/feedback/PublicForm";
import { requireActorOrRedirect } from "@/lib/auth/session";
import type { FormDefinition } from "@/lib/forms/definitions";
import { toFormDefinition } from "@/lib/forms/mapper";
import { getDraftVersion, getPublishedVersion, getVersionForActor } from "@/lib/forms/service";
import type { Actor } from "@/lib/security/authz";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Resolve which version to preview: an explicit `?version=` first, otherwise the
 * campaign's draft, otherwise its published version. Any failure → null.
 */
async function resolvePreview(actor: Actor, campaignId: string, versionParam: string | undefined): Promise<FormDefinition | null> {
  try {
    if (versionParam) {
      const row = await getVersionForActor(actor, versionParam);
      if (row.campaignId !== campaignId) return null;
      return toFormDefinition(row);
    }
    const row = (await getDraftVersion(actor, campaignId)) ?? (await getPublishedVersion(actor, campaignId));
    return row ? toFormDefinition(row) : null;
  } catch {
    return null;
  }
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/preview`);
  const form = await resolvePreview(actor, campaignId, firstParam((await searchParams).version));
  return { title: form ? `Preview · ${form.campaign.name}` : "Preview", robots: { index: false } };
}

export default async function CampaignPreviewPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/preview`);
  const form = await resolvePreview(actor, campaignId, firstParam((await searchParams).version));
  if (!form) notFound();

  return <PublicForm form={form} mode="preview" />;
}
