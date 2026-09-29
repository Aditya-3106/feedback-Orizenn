"use client";

import { useRouter } from "next/navigation";
import { setLinkStatusAction } from "@/actions/forms";
import { ConfirmAction, CopyButton, Flash, useFlash } from "@/components/ui/client";
import { StatusBadge } from "@/components/ui/primitives";

export function LinkActions({
  campaignId,
  link,
  publicUrl,
  canManage,
  isCurrentVersion,
}: {
  campaignId: string;
  link: { id: string; slug: string; status: string };
  publicUrl: string;
  canManage: boolean;
  isCurrentVersion: boolean;
}) {
  const router = useRouter();
  const { message, flash } = useFlash();

  async function set(status: "ACTIVE" | "PAUSED" | "EXPIRED") {
    const r = await setLinkStatusAction(link.id, campaignId, status);
    if (!r.success) throw new Error(r.error.message);
    flash({ tone: "success", text: `Link ${status.toLowerCase()}.` });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Flash message={message} />
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-orizenn-border bg-orizenn-bg px-3 py-2 font-mono text-xs text-orizenn-ink">{publicUrl}</code>
        <StatusBadge status={link.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={publicUrl} />
        <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
          Open form
        </a>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <button type="button" className="btn-secondary btn-sm" onClick={() => navigator.share({ url: publicUrl, title: "Student feedback" }).catch(() => undefined)}>
            Share
          </button>
        ) : null}
        {canManage && link.status === "ACTIVE" ? (
          <ConfirmAction
            title="Deactivate this link?"
            description="Students opening the link will see that the form is unavailable. You can reactivate it."
            confirmLabel="Deactivate"
            tone="danger"
            onConfirm={() => set("PAUSED")}
            trigger={(open) => (
              <button type="button" className="btn-ghost btn-sm text-orizenn-danger" onClick={open}>
                Deactivate
              </button>
            )}
          />
        ) : null}
        {canManage && link.status === "PAUSED" && isCurrentVersion ? (
          <button type="button" className="btn-ghost btn-sm" onClick={() => set("ACTIVE").catch((e) => flash({ tone: "danger", text: e.message }))}>
            Reactivate
          </button>
        ) : null}
      </div>
    </div>
  );
}
