import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { listRespondents } from "@/lib/submissions/service";
import { formatDateTime, formatNumber } from "@/lib/utils/format";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActorOrRedirect("/admin/students");
  const { q } = await searchParams;
  const students = await listRespondents(actor, q?.trim() || undefined);

  return (
    <div className="space-y-6 fade-in">
      <PageHeader
        eyebrow="Students"
        title="Students"
        description="Respondents across all campaigns. Identity is only shown for identified campaigns; pseudonymous and anonymous respondents appear by context fields only."
      />

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} className="input mt-1" placeholder="Name, college, branch, year…" />
        </div>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      {students.length === 0 ? (
        <EmptyState compact title="No students yet." description="Students appear here after they submit feedback." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Student</th>
                <th>College</th>
                <th>Branch</th>
                <th>Year</th>
                <th>Project type</th>
                <th className="text-right">Responses</th>
                <th>Last response</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const last = s.submissions[0];
                const identified = last?.campaign.responseMode === "IDENTIFIED";
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium text-orizenn-ink">{identified && s.name ? s.name : `Student ${String(i + 1).padStart(2, "0")}`}</div>
                      {identified && s.email ? <div className="hint">{s.email}</div> : null}
                    </td>
                    <td className="text-orizenn-muted">{s.college ?? "—"}</td>
                    <td className="text-orizenn-muted">{s.branch ?? "—"}</td>
                    <td className="text-orizenn-muted">{s.year ?? "—"}</td>
                    <td className="text-orizenn-muted">{s.projectType ?? "—"}</td>
                    <td className="text-right tabular-nums">{formatNumber(s._count.submissions)}</td>
                    <td className="text-orizenn-muted">{last ? `${formatDateTime(last.submittedAt)} · ${last.campaign.name}` : "—"}</td>
                    <td>
                      <StatusBadge status={last?.usageVerificationStatus ?? "UNKNOWN"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
