import Link from "next/link";
import { CampaignTable } from "@/components/campaign/CampaignTable";
import { PageHeader } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { listCampaigns } from "@/lib/campaigns/service";
import { can } from "@/lib/security/authz";
import { campaignStatusSchema } from "@/lib/validation/campaign";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; archived?: string }>;
}) {
  const actor = await requireActorOrRedirect("/admin/campaigns");
  const sp = await searchParams;
  const status = campaignStatusSchema.safeParse(sp.status);
  const campaigns = await listCampaigns(actor, {
    q: sp.q?.trim() || undefined,
    status: status.success ? status.data : undefined,
    includeArchived: sp.archived === "1",
  });
  const canCreate = can(actor.role, "campaign:create");

  return (
    <div className="space-y-6 fade-in">
      <PageHeader
        eyebrow="Campaigns"
        title="Campaigns"
        description="Every feedback campaign in your workspace, with its published version and response count."
        actions={
          canCreate ? (
            <Link href="/admin/campaigns/new" className="btn-primary">
              + Create Campaign
            </Link>
          ) : null
        }
      />

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Search campaign…" className="input mt-1" />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input mt-1">
            <option value="">Any</option>
            {["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "ARCHIVED"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-orizenn-muted">
          <input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} />
          Include archived
        </label>
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      <CampaignTable
        campaigns={campaigns}
        emptyAction={
          canCreate ? (
            <Link href="/admin/campaigns/new" className="btn-primary">
              Create Campaign
            </Link>
          ) : null
        }
      />
    </div>
  );
}
