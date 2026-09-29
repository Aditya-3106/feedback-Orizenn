"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteCampaignAction, duplicateCampaignAction, setCampaignStatusAction } from "@/actions/campaigns";
import { ConfirmAction, Flash, useFlash } from "@/components/ui/client";

export function CampaignStatusActions({
  campaignId,
  status,
  hasPublished,
  responseCount,
  canPublish,
  canDelete,
}: {
  campaignId: string;
  status: string;
  hasPublished: boolean;
  responseCount: number;
  canPublish: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { message, flash } = useFlash();
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    setBusy(true);
    const r = await setCampaignStatusAction(campaignId, next);
    setBusy(false);
    if (!r.success) throw new Error(r.error.message);
    flash({ tone: "success", text: `Campaign ${next.toLowerCase()}.` });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Flash message={message} />
      {canPublish && status === "ACTIVE" ? (
        <ConfirmAction
          title="Pause this campaign?"
          description="The public form becomes temporarily unavailable. You can resume at any time."
          confirmLabel="Pause"
          onConfirm={() => change("PAUSED")}
          trigger={(open) => (
            <button type="button" className="btn-secondary btn-sm" onClick={open} disabled={busy}>
              Pause
            </button>
          )}
        />
      ) : null}
      {canPublish && (status === "PAUSED" || (status === "CLOSED" && hasPublished)) ? (
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => change("ACTIVE").catch((e) => flash({ tone: "danger", text: e.message }))}>
          {status === "PAUSED" ? "Resume" : "Reopen"}
        </button>
      ) : null}
      {canPublish && (status === "ACTIVE" || status === "PAUSED") ? (
        <ConfirmAction
          title="Close this campaign?"
          description="The link stops accepting responses. Existing responses and analytics stay available."
          confirmLabel="Close campaign"
          tone="danger"
          onConfirm={() => change("CLOSED")}
          trigger={(open) => (
            <button type="button" className="btn-secondary btn-sm" onClick={open} disabled={busy}>
              Close
            </button>
          )}
        />
      ) : null}
      {canPublish && status !== "ARCHIVED" && status !== "ACTIVE" ? (
        <ConfirmAction
          title="Archive this campaign?"
          description="Archived campaigns are hidden from the default list but keep every response."
          confirmLabel="Archive"
          onConfirm={() => change("ARCHIVED")}
          trigger={(open) => (
            <button type="button" className="btn-ghost btn-sm" onClick={open} disabled={busy}>
              Archive
            </button>
          )}
        />
      ) : null}
      {canPublish ? (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await duplicateCampaignAction(campaignId);
            setBusy(false);
            if (r.success) router.push(`/admin/campaigns/${r.data.id}`);
            else flash({ tone: "danger", text: r.error.message });
          }}
        >
          Duplicate
        </button>
      ) : null}
      {canDelete && responseCount === 0 ? (
        <ConfirmAction
          title="Delete this campaign?"
          description="This permanently removes the campaign and its draft questions. It has no responses."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            const r = await deleteCampaignAction(campaignId);
            if (!r.success) throw new Error(r.error.message);
            router.push("/admin/campaigns");
          }}
          trigger={(open) => (
            <button type="button" className="btn-ghost btn-sm text-orizenn-danger" onClick={open} disabled={busy}>
              Delete
            </button>
          )}
        />
      ) : null}
    </div>
  );
}
