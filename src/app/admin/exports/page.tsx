import Link from "next/link";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { listWorkspaceExportJobs } from "@/lib/exports/service";
import { formatDateTime } from "@/lib/utils/format";
import { EXPORT_TYPE_LABELS, type ExportType } from "@/lib/validation/export";

export default async function ExportsPage() {
  const actor = await requireActorOrRedirect("/admin/exports");
  const jobs = await listWorkspaceExportJobs(actor);

  return (
    <div className="space-y-6 fade-in">
      <PageHeader eyebrow="Exports" title="Exports" description="Every workbook generated in this workspace. Files are streamed to the browser at generation time and not stored on the server; open a campaign to generate a new one." />
      {jobs.length === 0 ? (
        <EmptyState compact title="No exports yet." description="Open a campaign and use its Export tab to download an Excel workbook." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Type</th>
                <th>Status</th>
                <th>Requested by</th>
                <th>When</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={`/admin/campaigns/${j.campaign.id}/export`} className="font-medium text-orizenn-ink hover:text-orizenn-blue">
                      {j.campaign.name}
                    </Link>
                  </td>
                  <td className="text-orizenn-muted">{EXPORT_TYPE_LABELS[j.type as ExportType]?.title ?? j.type}</td>
                  <td>
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="text-orizenn-muted">{j.requestedBy.name}</td>
                  <td className="text-orizenn-muted">{formatDateTime(j.createdAt)}</td>
                  <td className="font-mono text-[11px] text-orizenn-subtle">{j.fileName ?? j.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
