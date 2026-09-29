import Link from "next/link";
import { VersionActions } from "@/components/campaign/VersionActions";
import { EmptyState, Section, StatusBadge } from "@/components/ui/primitives";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { compareVersions } from "@/lib/forms/compare";
import { getVersionDefinition, listVersions } from "@/lib/forms/service";
import { can } from "@/lib/security/authz";
import { formatDateTime, formatNumber } from "@/lib/utils/format";

export default async function VersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { campaignId } = await params;
  const sp = await searchParams;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/versions`);
  const versions = await listVersions(actor, campaignId);
  const hasDraft = versions.some((v) => v.status === "DRAFT");
  const canEdit = can(actor.role, "form:edit");
  const canTemplates = can(actor.role, "templates:manage");

  // Default comparison: latest two versions.
  const aId = sp.a ?? versions[1]?.id;
  const bId = sp.b ?? versions[0]?.id;
  const [a, b] =
    aId && bId && aId !== bId
      ? await Promise.all([getVersionDefinition(actor, aId), getVersionDefinition(actor, bId)])
      : [null, null];
  const diff = a && b ? compareVersions(a.questions, b.questions) : null;
  const responsesOf = (id: string) => versions.find((v) => v.id === id)?._count.submissions ?? 0;

  if (!versions.length) {
    return <EmptyState title="No versions yet." description="Build the first form to create version 1." action={canEdit ? <Link href={`/admin/campaigns/${campaignId}/source`} className="btn-primary">Build form</Link> : null} />;
  }

  return (
    <div className="space-y-6">
      <Section title="Versions" description="Published versions are immutable. Responses stay attached to the version they were submitted against.">
        <ul className="divide-y divide-orizenn-border">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl">v{v.versionNumber}</span>
                  <StatusBadge status={v.status} />
                </div>
                <div className="hint mt-1">
                  {v._count.questions} questions · {formatNumber(v._count.submissions)} responses · {v.publishedAt ? `published ${formatDateTime(v.publishedAt)}` : `created ${formatDateTime(v.createdAt)}`}
                  {v.links[0] ? <span className="ml-2 font-mono">/f/{v.links[0].slug}</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {v.status === "DRAFT" && canEdit ? (
                  <Link href={`/admin/campaigns/${campaignId}/builder?version=${v.id}`} className="btn-primary btn-sm">
                    Edit draft
                  </Link>
                ) : null}
                <Link href={`/admin/campaigns/${campaignId}/preview?version=${v.id}`} className="btn-secondary btn-sm">
                  Preview
                </Link>
                {v._count.submissions > 0 ? (
                  <Link href={`/admin/campaigns/${campaignId}/analytics?versionId=${v.id}`} className="btn-secondary btn-sm">
                    Analytics
                  </Link>
                ) : null}
                <VersionActions campaignId={campaignId} versionId={v.id} versionNumber={v.versionNumber} canEdit={canEdit} canTemplates={canTemplates} hasDraft={hasDraft} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {versions.length >= 2 ? (
        <Section
          title="What changed?"
          description="Only questions that share a comparable key are compared numerically. New questions have no historical comparison."
          actions={
            <form className="flex items-center gap-2 text-sm">
              <select name="a" defaultValue={aId} className="input py-1.5" aria-label="From version">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}
                  </option>
                ))}
              </select>
              <span className="text-orizenn-subtle">→</span>
              <select name="b" defaultValue={bId} className="input py-1.5" aria-label="To version">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-secondary btn-sm">
                Compare
              </button>
            </form>
          }
        >
          {diff && a && b ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Questions added" value={`+${diff.added.length}`} />
                <Stat label="Questions removed" value={`−${diff.removed.length}`} />
                <Stat label="Questions changed" value={String(diff.changed.length)} />
                <Stat label="Responses" value={`${formatNumber(responsesOf(a.versionId))} → ${formatNumber(responsesOf(b.versionId))}`} />
              </div>

              <DiffList title="Comparable questions" empty="No shared comparable keys. Mark questions with the same comparable key to compare them across versions." items={diff.comparable.map((c) => ({ key: c.key, primary: c.after.text, secondary: c.before.text !== c.after.text ? `was: “${c.before.text}”` : `key ${c.key}` }))} />
              <DiffList title={`New in v${b.versionNumber}`} empty="No new questions." items={diff.added.map((q) => ({ key: q.id, primary: q.text, secondary: "No historical comparison available." }))} />
              <DiffList title={`Removed since v${a.versionNumber}`} empty="Nothing removed." items={diff.removed.map((q) => ({ key: q.id, primary: q.text, secondary: q.type }))} />
              <DiffList title="Changed wording or settings" empty="No changes to existing questions." items={diff.changed.map((c) => ({ key: c.after.id, primary: c.after.text, secondary: `changed: ${c.fields.join(", ")}` }))} />
            </div>
          ) : (
            <p className="hint">Choose two different versions to compare.</p>
          )}
        </Section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono-label">{label}</div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
    </div>
  );
}

function DiffList({ title, items, empty }: { title: string; items: Array<{ key: string; primary: string; secondary: string }>; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-orizenn-ink">{title}</h3>
      {items.length === 0 ? (
        <p className="hint mt-1">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-orizenn-border rounded-lg border border-orizenn-border">
          {items.map((it) => (
            <li key={it.key} className="px-3 py-2">
              <div className="text-sm text-orizenn-ink">{it.primary}</div>
              <div className="hint">{it.secondary}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
