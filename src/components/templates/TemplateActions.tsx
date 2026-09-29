"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { duplicateTemplateAction, renameTemplateAction, setTemplateArchivedAction } from "@/actions/templates";
import { ConfirmAction, Flash, Modal, useFlash } from "@/components/ui/client";

export function TemplateActions({ template }: { template: { id: string; name: string; description: string | null; archived: boolean } }) {
  const router = useRouter();
  const { message, flash } = useFlash();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ success: boolean; error?: { message: string } }>, ok: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.success) {
      flash({ tone: "success", text: ok });
      router.refresh();
    } else flash({ tone: "danger", text: r.error?.message ?? "Something went wrong." });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Flash message={message} />
      <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => run(() => duplicateTemplateAction(template.id), "Template duplicated.")}>
        Duplicate
      </button>
      <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(true)}>
        Edit
      </button>
      {template.archived ? (
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => run(() => setTemplateArchivedAction(template.id, false), "Template restored.")}>
          Restore
        </button>
      ) : (
        <ConfirmAction
          title="Archive this template?"
          description="Archived templates no longer appear when creating a form. Existing campaigns are unaffected."
          confirmLabel="Archive"
          onConfirm={async () => {
            const r = await setTemplateArchivedAction(template.id, true);
            if (!r.success) throw new Error(r.error.message);
            router.refresh();
          }}
          trigger={(openConfirm) => (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={openConfirm}>
              Archive
            </button>
          )}
        />
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit template"
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
                const r = await renameTemplateAction(template.id, name, description);
                setBusy(false);
                if (r.success) {
                  setOpen(false);
                  router.refresh();
                } else setError(r.error.fields?.name?.[0] ?? r.error.message);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor={`name-${template.id}`} className="label">
              Name
            </label>
            <input id={`name-${template.id}`} className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`desc-${template.id}`} className="label">
              Description
            </label>
            <input id={`desc-${template.id}`} className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-orizenn-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
