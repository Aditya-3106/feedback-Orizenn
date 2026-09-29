import Link from "next/link";
import { EmptyState, StatusBadge } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { getCampaign } from "@/lib/campaigns/service";
import { getSegmentOptions, listSubmissions } from "@/lib/submissions/service";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/utils/format";
import { filtersFromSearchParams, filtersToSearchParams, hasActiveFilters } from "@/lib/validation/filters";

export const dynamic = "force-dynamic";

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaignId } = await params;
  const sp = await searchParams;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/responses`);
  const filters = filtersFromSearchParams(sp);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Number(sp.page ?? 1) || 1;

  const [campaign, result, options] = await Promise.all([
    getCampaign(actor, campaignId),
    listSubmissions(actor, campaignId, { filters, q: q || undefined, page, pageSize: 25 }),
    getSegmentOptions(actor, campaignId),
  ]);
  const base = `/admin/campaigns/${campaignId}/responses`;
  const filtered = hasActiveFilters(filters) || !!q;
  const anonymous = campaign.responseMode === "ANONYMOUS";

  const pageHref = (p: number) => {
    const s = filtersToSearchParams(filters);
    if (q) s.set("q", q);
    s.set("page", String(p));
    return `${base}?${s.toString()}`;
  };

  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3 p-4" role="search">
        {!anonymous ? (
          <div className="min-w-[200px] flex-1">
            <label htmlFor="q" className="label">
              Search
            </label>
            <input id="q" name="q" defaultValue={q} className="input mt-1" placeholder={campaign.responseMode === "IDENTIFIED" ? "Name, email, college…" : "College, branch, year…"} />
          </div>
        ) : null}
        {(["college", "branch", "year", "projectType"] as const).map((k) =>
          options[k].length ? (
            <div key={k}>
              <label htmlFor={k} className="label capitalize">
                {k === "projectType" ? "Project type" : k}
              </label>
              <select id={k} name={k} defaultValue={filters[k] ?? ""} className="input mt-1">
                <option value="">Any</option>
                {options[k].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null,
        )}
        <div>
          <label htmlFor="from" className="label">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={filters.from?.toISOString().slice(0, 10) ?? ""} className="input mt-1" />
        </div>
        <div>
          <label htmlFor="to" className="label">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.to?.toISOString().slice(0, 10) ?? ""} className="input mt-1" />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? "COMPLETED"} className="input mt-1">
            {["COMPLETED", "IN_PROGRESS", "ABANDONED", "INVALID"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Apply
        </button>
        {filtered ? (
          <Link href={base} className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <EmptyState
          compact
          title={filtered ? "No responses match these filters." : "No responses yet."}
          description={filtered ? "Try widening the date range or clearing a filter." : "Share your feedback link with students to start collecting responses."}
        />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>College</th>
                  <th>Branch</th>
                  <th>Year</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Usage</th>
                  <th>Version</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((s) => (
                  <tr key={s.id} className="hover:bg-orizenn-bg/60">
                    <td>
                      <Link href={`${base}/${s.id}`} className="font-medium text-orizenn-ink hover:text-orizenn-blue">
                        {s.respondent.label}
                      </Link>
                      {s.respondent.identityShown && s.respondent.email ? <div className="hint">{s.respondent.email}</div> : null}
                    </td>
                    <td className="text-orizenn-muted">{s.respondent.college ?? "—"}</td>
                    <td className="text-orizenn-muted">{s.respondent.branch ?? "—"}</td>
                    <td className="text-orizenn-muted">{s.respondent.year ?? "—"}</td>
                    <td className="text-orizenn-muted">{formatDateTime(s.submittedAt)}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <StatusBadge status={s.usageVerificationStatus} />
                    </td>
                    <td className="font-mono text-xs text-orizenn-muted">v{s.versionNumber}</td>
                    <td className="text-right text-orizenn-muted tabular-nums">{formatDuration(s.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-orizenn-muted">
            <span>
              {formatNumber(result.total)} {result.total === 1 ? "response" : "responses"} · page {result.page} of {result.pageCount}
            </span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Link href={pageHref(result.page - 1)} className="btn-secondary btn-sm">
                  Previous
                </Link>
              ) : null}
              {result.page < result.pageCount ? (
                <Link href={pageHref(result.page + 1)} className="btn-secondary btn-sm">
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
