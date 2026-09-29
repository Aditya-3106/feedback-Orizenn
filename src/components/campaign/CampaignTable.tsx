import Link from "next/link";
import { EmptyState, StatusBadge } from "@/components/ui/primitives";
import type { CampaignListRow } from "@/lib/campaigns/service";
import { formatNumber, formatRelative } from "@/lib/utils/format";

export function CampaignTable({ campaigns, emptyAction }: { campaigns: CampaignListRow[]; emptyAction?: React.ReactNode }) {
  if (!campaigns.length) {
    return (
      <EmptyState
        title="No campaigns yet."
        description="Create your first feedback campaign to start collecting responses."
        action={emptyAction}
      />
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-[720px]">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th className="text-right">Responses</th>
            <th>Version</th>
            <th>Last response</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-orizenn-bg/60">
              <td>
                <Link href={`/admin/campaigns/${c.id}`} className="font-medium text-orizenn-ink hover:text-orizenn-blue">
                  {c.name}
                </Link>
                <div className="hint mt-0.5 line-clamp-1">{c.goal}</div>
              </td>
              <td>
                <StatusBadge status={c.status} />
              </td>
              <td className="text-right tabular-nums">{formatNumber(c._count.submissions)}</td>
              <td className="font-mono text-xs text-orizenn-muted">{c.versions[0] ? `v${c.versions[0].versionNumber}` : "—"}</td>
              <td className="text-orizenn-muted">{formatRelative(c.submissions[0]?.submittedAt)}</td>
              <td className="text-right">
                <Link href={`/admin/campaigns/${c.id}`} className="btn-secondary btn-sm">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
