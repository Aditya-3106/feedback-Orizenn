"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { publishVersionAction } from "@/actions/forms";
import { CopyButton, Modal } from "@/components/ui/client";
import { Notice } from "@/components/ui/primitives";
import { estimateMinutes, type QuestionDefinition } from "@/lib/forms/definitions";
import { checkPublishable } from "@/lib/forms/publish-check";
import type { PublishResult } from "@/lib/forms/service";

export function PublishDialog({
  open,
  onClose,
  campaignId,
  campaignName,
  versionId,
  versionNumber,
  questions,
  publicBaseUrl,
  onSelectQuestion,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  versionId: string;
  versionNumber: number;
  questions: QuestionDefinition[];
  publicBaseUrl: string;
  onSelectQuestion: (id: string) => void;
}) {
  const router = useRouter();
  const issues = useMemo(() => checkPublishable({ questions, campaign: { name: campaignName } }), [questions, campaignName]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[] | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const minutes = estimateMinutes(questions);

  async function publish() {
    setBusy(true);
    setError(null);
    const r = await publishVersionAction(versionId, campaignId);
    setBusy(false);
    if (!r.success) {
      setError(r.error.fields?.publish ?? [r.error.message]);
      return;
    }
    setResult(r.data);
  }

  const url = result ? `${publicBaseUrl}/f/${result.linkSlug}` : "";

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return;
        if (result) router.push(`/admin/campaigns/${campaignId}`);
        else onClose();
      }}
      title={result ? "Feedback form published." : "Ready to publish?"}
      description={result ? "Share this link with students. Published versions are immutable." : `Version ${versionNumber} · ${questions.length} ${questions.length === 1 ? "question" : "questions"} · estimated completion ${minutes} min`}
      footer={
        result ? (
          <button type="button" className="btn-primary" onClick={() => router.push(`/admin/campaigns/${campaignId}`)}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={publish} disabled={busy || issues.length > 0}>
              {busy ? "Publishing…" : "Publish Form"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <code className="block break-all rounded-md border border-orizenn-border bg-orizenn-bg px-3 py-2 font-mono text-xs">{url}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={url} />
            <a href={url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              Open form
            </a>
          </div>
          <p className="hint">The campaign is now active. Pause or close it from the campaign page.</p>
        </div>
      ) : issues.length ? (
        <div className="space-y-2">
          <Notice tone="warning" title={`${issues.length} ${issues.length === 1 ? "issue" : "issues"} to fix before publishing`} />
          <ul className="space-y-1 text-sm">
            {issues.map((iss, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-orizenn-warning">•</span>
                {iss.questionId ? (
                  <button type="button" className="text-left text-orizenn-ink underline-offset-2 hover:underline" onClick={() => { onSelectQuestion(iss.questionId!); onClose(); }}>
                    {iss.message}
                  </button>
                ) : (
                  <span>{iss.message}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-orizenn-muted">
          <p>Publishing creates a unique, non-sequential link and activates the campaign. Any previously published version is archived and its link expires.</p>
          <ul className="space-y-1">
            <li>✓ Campaign named</li>
            <li>✓ {questions.length} valid {questions.length === 1 ? "question" : "questions"}</li>
            <li>✓ Choice questions have options</li>
            <li>✓ Analytics metadata valid, no duplicate keys</li>
          </ul>
          {error ? <Notice tone="danger" title="The form is not ready to publish.">{error.join(" ")}</Notice> : null}
        </div>
      )}
    </Modal>
  );
}
