import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createDraftFormAction } from "@/actions/forms";
import { SubmitButton } from "@/components/ui/client";
import { Notice, PageHeader } from "@/components/ui/primitives";
import { isAppError } from "@/lib/api/errors";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { listReusableForms } from "@/lib/forms/service";
import { can } from "@/lib/security/authz";
import { listTemplates } from "@/lib/templates/service";
import { formatDate, formatNumber } from "@/lib/utils/format";

export default async function FormSourcePage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/source`);
  if (!can(actor.role, "form:edit")) redirect(`/admin/campaigns/${campaignId}`);

  let campaign;
  try {
    campaign = await getCampaign(actor, campaignId);
  } catch (err) {
    if (isAppError(err)) notFound();
    throw err;
  }
  const draft = campaign.versions.find((v) => v.status === "DRAFT");
  if (draft) redirect(`/admin/campaigns/${campaignId}/builder?version=${draft.id}`);

  const [previous, templates] = await Promise.all([listReusableForms(actor), listTemplates(actor)]);
  const published = campaign.versions.find((v) => v.status === "PUBLISHED");

  return (
    <div className="mx-auto max-w-4xl space-y-8 fade-in">
      <PageHeader
        eyebrow={published ? `New version for ${campaign.name}` : "Step 2 of 2"}
        title="How would you like to create the form?"
        description={published ? `Start the next version from v${published.versionNumber}, another form, a template, or from scratch. Published versions are never modified.` : "Reuse a previous questionnaire, start from a template, build it yourself, or ask AI inside the builder."}
      />

      {published ? (
        <Notice tone="info" title={`Continue from v${published.versionNumber}`} action={
          <form action={createDraftFormAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="kind" value="version" />
            <input type="hidden" name="versionId" value={published.id} />
            <SubmitButton className="btn-primary btn-sm" pendingText="Cloning…">Clone v{published.versionNumber}</SubmitButton>
          </form>
        }>
          Creates draft v{published.versionNumber + 1} with the same questions. Old responses stay attached to v{published.versionNumber}.
        </Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="mono-label">Option A</div>
          <h2 className="mt-2 font-display text-2xl">Use previous form</h2>
          <p className="hint mt-1">Start from an older questionnaire. It is cloned; the original is untouched.</p>
        </div>
        <form action={createDraftFormAction} className="card flex flex-col p-5">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input type="hidden" name="kind" value="blank" />
          <div className="mono-label">Option B</div>
          <h2 className="mt-2 font-display text-2xl">Create new form</h2>
          <p className="hint mt-1 flex-1">Build questions yourself in the editor.</p>
          <SubmitButton className="btn-secondary mt-4" pendingText="Creating…">Start blank</SubmitButton>
        </form>
        <form action={createDraftFormAction} className="card flex flex-col border-orizenn-blue/30 p-5">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input type="hidden" name="kind" value="blank" />
          <div className="mono-label text-orizenn-blue">Option C</div>
          <h2 className="mt-2 font-display text-2xl">Ask AI</h2>
          <p className="hint mt-1 flex-1">Describe what you want to learn; review and approve the suggested questions in the builder.</p>
          <SubmitButton className="btn-primary mt-4" pendingText="Creating…">Start with AI</SubmitButton>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Previous forms</h2>
        {previous.length === 0 ? (
          <p className="hint">No previous forms with questions yet.</p>
        ) : (
          <ul className="card divide-y divide-orizenn-border">
            {previous.map((v) => (
              <li key={v.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium text-orizenn-ink">
                    {v.campaign.name} <span className="font-mono text-xs text-orizenn-subtle">v{v.versionNumber}</span>
                  </div>
                  <div className="hint mt-0.5">
                    {v._count.questions} questions · {formatNumber(v._count.submissions)} responses · {v.status.toLowerCase()} {v.publishedAt ? formatDate(v.publishedAt) : ""}
                  </div>
                </div>
                <form action={createDraftFormAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="kind" value="version" />
                  <input type="hidden" name="versionId" value={v.id} />
                  <SubmitButton className="btn-secondary btn-sm" pendingText="Cloning…">Use this form</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Templates</h2>
          <Link href="/admin/templates" className="text-sm text-orizenn-blue hover:underline">
            Manage templates
          </Link>
        </div>
        {templates.length === 0 ? (
          <p className="hint">No templates yet. Save any version as a template from its Versions tab.</p>
        ) : (
          <ul className="card divide-y divide-orizenn-border">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium text-orizenn-ink">{t.name}</div>
                  <div className="hint mt-0.5">
                    {Array.isArray(t.questionsJson) ? t.questionsJson.length : 0} questions{t.description ? ` · ${t.description}` : ""}
                  </div>
                </div>
                <form action={createDraftFormAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="kind" value="template" />
                  <input type="hidden" name="templateId" value={t.id} />
                  <SubmitButton className="btn-secondary btn-sm" pendingText="Creating…">Use template</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
