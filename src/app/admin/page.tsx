import Link from "next/link";
import { CampaignTable } from "@/components/campaign/CampaignTable";
import { PageHeader, StatCard } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getDashboardStats, listCampaigns } from "@/lib/campaigns/service";
import { can } from "@/lib/security/authz";
import { formatNumber, formatPercent } from "@/lib/utils/format";

export default async function AdminDashboardPage() {
  const actor = await requireActorOrRedirect("/admin");
  const [stats, campaigns] = await Promise.all([getDashboardStats(actor), listCampaigns(actor, { limit: 8 })]);
  const canCreate = can(actor.role, "campaign:create");

  return (
    <div className="space-y-8 fade-in">
      <PageHeader
        eyebrow="Overview"
        title="Feedback Intelligence"
        description="Understand what students are actually telling you."
        actions={
          canCreate ? (
            <Link href="/admin/campaigns/new" className="btn-primary">
              + Create Campaign
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active campaigns" value={formatNumber(stats.activeCampaigns)} />
        <StatCard label="Total responses" value={formatNumber(stats.totalResponses)} />
        <StatCard label="Students" value={formatNumber(stats.students)} />
        <StatCard label="Avg completion" value={stats.avgCompletion == null ? "—" : formatPercent(stats.avgCompletion)} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-orizenn-ink">Recent campaigns</h2>
          <Link href="/admin/campaigns" className="text-sm text-orizenn-blue hover:underline">
            View all
          </Link>
        </div>
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
      </section>
    </div>
  );
}
