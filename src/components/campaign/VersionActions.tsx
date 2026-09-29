"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDraftAction } from "@/actions/forms";
import { saveAsTemplateAction } from "@/actions/templates";
import { Flash, Modal, useFlash } from "@/components/ui/client";

export function VersionActions({
  campaignId,
  versionId,
  versionNumber,
  canEdit,
  canTemplates,
  hasDraft,
}: {
  campaignId: string;
  versionId: string;
  versionNumber: number;
  canEdit: boolean;
  canTemplates: boolean;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const { message, flash } = useFlash();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`Version ${versionNumber} template`);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <Flash message={message} />
      {canEdit && !hasDraft ? (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await createDraftAction(campaignId, { kind: "version", versionId });
            setBusy(false);
            if (r.success) router.push(`/admin/campaigns/${campaignId}/builder?version=${r.data.versionId}`);
            else flash({ tone: "danger", text: r.error.message });
          }}
        >
          Clone to new draft
        </button>
      ) : null}
      {canTemplates ? (
        <>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
            Save as template
          </button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title="Save as template"
            description="Templates are complete questionnaires you can start future campaigns from."
            size="sm"
            footer={
              <>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    const r = await saveAsTemplateAction(versionId, name, description);
                    setBusy(false);
                    if (r.success) {
                      setOpen(false);
                      flash({ tone: "success", text: "Template saved." });
                    } else setError(r.error.fields?.name?.[0] ?? r.error.message);
                  }}
                >
                  {busy ? "Saving…" : "Save template"}
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <div>
                <label htmlFor="tpl-name" className="label">
                  Template name
                </label>
                <input id="tpl-name" className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="tpl-desc" className="label">
                  Description <span className="text-orizenn-subtle">(optional)</span>
                </label>
                <input id="tpl-desc" className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {error ? (
                <p role="alert" className="text-xs text-orizenn-danger">
                  {error}
                </p>
              ) : null}
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
