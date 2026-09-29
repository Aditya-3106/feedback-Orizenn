import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyValue, Section, StatusBadge } from "@/components/ui/primitives";
import { isAppError } from "@/lib/api/errors";
import { requireActorOrRedirect } from "@/lib/auth/session";
import { describeAnswer } from "@/lib/forms/definitions";
import { getSubmissionDetail } from "@/lib/submissions/service";
import { formatDateTime, formatDuration } from "@/lib/utils/format";

export default async function ResponseDetailPage({ params }: { params: Promise<{ campaignId: string; submissionId: string }> }) {
  const { campaignId, submissionId } = await params;
  const actor = await requireActorOrRedirect(`/admin/campaigns/${campaignId}/responses/${submissionId}`);

  let detail;
  try {
    detail = await getSubmissionDetail(actor, submissionId);
  } catch (err) {
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  if (detail.campaignId !== campaignId) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/admin/campaigns/${campaignId}/responses`} className="text-sm text-orizenn-blue hover:underline">
          ← All responses
        </Link>
        <span className="mono-label">v{detail.versionNumber} · {detail.id.slice(-8)}</span>
      </div>

      <Section title="Response">
        <KeyValue
          items={[
            { label: "Student", value: detail.respondent.label },
            ...(detail.respondent.identityShown && detail.respondent.email ? [{ label: "Email", value: detail.respondent.email }] : []),
            { label: "Submitted", value: formatDateTime(detail.submittedAt) },
            { label: "College", value: detail.respondent.college ?? "—" },
            { label: "Branch", value: detail.respondent.branch ?? "—" },
            { label: "Year", value: detail.respondent.year ?? "—" },
            { label: "Project type", value: detail.respondent.projectType ?? "—" },
            { label: "Status", value: <StatusBadge status={detail.status} /> },
            { label: "Orizenn usage", value: <StatusBadge status={detail.usageVerificationStatus} /> },
            { label: "Time to complete", value: formatDuration(detail.durationSeconds) },
            { label: "Quote consent", value: detail.consentToQuote == null ? "Not asked" : detail.consentToQuote ? "Yes" : "No" },
          ]}
        />
      </Section>

      <Section title="Answers" description="Shown against the exact form version the student saw.">
        <ol className="divide-y divide-orizenn-border">
          {detail.answers.map(({ question, value }, i) => (
            <li key={question.id} className="grid gap-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[3rem_1fr]">
              <div className="font-mono text-xs text-orizenn-subtle">Q{String(i + 1).padStart(2, "0")}</div>
              <div>
                <div className="text-sm text-orizenn-muted">{question.text}</div>
                <div className="mt-1 text-orizenn-ink">
                  {value ? (
                    value.kind === "text" && (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") ? (
                      <blockquote className="whitespace-pre-wrap border-l-2 border-orizenn-border pl-3 text-sm">“{value.value}”</blockquote>
                    ) : (
                      <span className="text-sm">→ {describeAnswer(question, value)}</span>
                    )
                  ) : (
                    <span className="text-sm italic text-orizenn-subtle">Not answered</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
