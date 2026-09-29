"use client";

import { useActionState, useState } from "react";
import type { CampaignFormState } from "@/actions/campaigns";
import { SubmitButton } from "@/components/ui/client";
import { FieldError, Notice } from "@/components/ui/primitives";
import { RESPONDENT_FIELDS, RESPONDENT_FIELD_LABELS, RESPONSE_MODES } from "@/lib/forms/definitions";

export interface CampaignFormValues {
  name?: string;
  description?: string | null;
  goal?: string;
  targetAudience?: string | null;
  responseMode?: string;
  allowMultipleResponses?: boolean;
  requireQuoteConsent?: boolean;
  respondentFields?: string[];
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  maxResponses?: number | null;
}

const MODE_HELP: Record<string, string> = {
  IDENTIFIED: "Store student identity. Names and emails appear in responses and exports.",
  PSEUDONYMOUS: "Store context (college, year…) with an internal id. Names never appear in analytics.",
  ANONYMOUS: "Collect no identifying information. Name and email cannot be requested.",
};

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function CampaignForm({
  action,
  initial = {},
  submitLabel = "Create campaign",
  mode = "create",
}: {
  action: (prev: CampaignFormState, formData: FormData) => Promise<CampaignFormState>;
  initial?: CampaignFormValues;
  submitLabel?: string;
  mode?: "create" | "edit";
}) {
  const [state, formAction] = useActionState<CampaignFormState, FormData>(action, {});
  const values = { ...initial, ...((state.values ?? {}) as CampaignFormValues) };
  const [responseMode, setResponseMode] = useState<string>((values.responseMode as string) ?? "PSEUDONYMOUS");
  const fields = state.fields ?? {};
  const saved = mode === "edit" && state.values && !state.error && !state.fields;

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {saved ? <Notice tone="success">Campaign settings saved.</Notice> : null}

      <fieldset className="card space-y-5 p-5">
        <legend className="sr-only">Campaign basics</legend>
        <div>
          <h2 className="font-display text-2xl text-orizenn-ink">What are you collecting feedback about?</h2>
          <p className="hint mt-1">A campaign is the business purpose. The questionnaire itself is versioned separately.</p>
        </div>
        <div>
          <label htmlFor="name" className="label">
            Campaign name
          </label>
          <input id="name" name="name" required minLength={2} maxLength={100} defaultValue={values.name ?? ""} className={`input mt-1 ${fields.name ? "input-error" : ""}`} aria-describedby={fields.name ? "name-error" : undefined} placeholder="September Student Feedback" />
          <FieldError id="name-error" errors={fields.name} />
        </div>
        <div>
          <label htmlFor="goal" className="label">
            Internal goal
          </label>
          <textarea id="goal" name="goal" required minLength={10} maxLength={1000} rows={3} defaultValue={values.goal ?? ""} className={`input mt-1 ${fields.goal ? "input-error" : ""}`} aria-describedby={fields.goal ? "goal-error" : undefined} placeholder="Understand whether students found Orizenn useful, accurate and easy to understand." />
          <FieldError id="goal-error" errors={fields.goal} />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="description" className="label">
              Description <span className="text-orizenn-subtle">(optional)</span>
            </label>
            <textarea id="description" name="description" maxLength={1000} rows={2} defaultValue={values.description ?? ""} className="input mt-1" />
            <FieldError errors={fields.description} />
          </div>
          <div>
            <label htmlFor="targetAudience" className="label">
              Target audience <span className="text-orizenn-subtle">(optional)</span>
            </label>
            <input id="targetAudience" name="targetAudience" maxLength={200} defaultValue={values.targetAudience ?? ""} className="input mt-1" placeholder="TE/BE students who used Orizenn in September" />
            <FieldError errors={fields.targetAudience} />
          </div>
        </div>
      </fieldset>

      <fieldset className="card space-y-5 p-5">
        <legend className="sr-only">Response settings</legend>
        <div>
          <h2 className="font-display text-2xl text-orizenn-ink">Response settings</h2>
          <p className="hint mt-1">Privacy is configured here and enforced at the data layer, not only in the UI.</p>
        </div>

        <div role="radiogroup" aria-labelledby="mode-label" className="space-y-2">
          <div id="mode-label" className="label">
            Response mode
          </div>
          {RESPONSE_MODES.map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${responseMode === m ? "border-orizenn-blue bg-orizenn-blue-soft/40" : "border-orizenn-border"}`}>
              <input type="radio" name="responseMode" value={m} checked={responseMode === m} onChange={() => setResponseMode(m)} className="mt-1" />
              <span>
                <span className="block text-sm font-medium text-orizenn-ink">{m.charAt(0) + m.slice(1).toLowerCase()}</span>
                <span className="hint">{MODE_HELP[m]}</span>
              </span>
            </label>
          ))}
          <FieldError errors={fields.responseMode} />
        </div>

        <div>
          <div className="label">Student context to collect</div>
          <p className="hint">Only the fields you select appear on the form.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RESPONDENT_FIELDS.map((f) => {
              const disabled = responseMode === "ANONYMOUS" && (f === "name" || f === "email");
              return (
                <label key={f} className={`inline-flex items-center gap-2 rounded-lg border border-orizenn-border px-3 py-1.5 text-sm ${disabled ? "opacity-50" : ""}`}>
                  <input type="checkbox" name="respondentFields" value={f} disabled={disabled} defaultChecked={values.respondentFields?.includes(f) ?? (f === "college" || f === "year")} />
                  {RESPONDENT_FIELD_LABELS[f]}
                </label>
              );
            })}
          </div>
          <FieldError errors={fields.respondentFields} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-orizenn-ink">
            <input type="checkbox" name="allowMultipleResponses" defaultChecked={values.allowMultipleResponses ?? false} />
            Allow multiple responses from the same student
          </label>
          <label className="flex items-center gap-2 text-sm text-orizenn-ink">
            <input type="checkbox" name="requireQuoteConsent" defaultChecked={values.requireQuoteConsent ?? false} />
            Ask for consent before quoting feedback
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label htmlFor="startsAt" className="label">
              Opens on <span className="text-orizenn-subtle">(optional)</span>
            </label>
            <input id="startsAt" name="startsAt" type="date" defaultValue={toDateInput(values.startsAt)} className="input mt-1" />
            <FieldError errors={fields.startsAt} />
          </div>
          <div>
            <label htmlFor="endsAt" className="label">
              Close date <span className="text-orizenn-subtle">(optional)</span>
            </label>
            <input id="endsAt" name="endsAt" type="date" defaultValue={toDateInput(values.endsAt)} className={`input mt-1 ${fields.endsAt ? "input-error" : ""}`} />
            <FieldError errors={fields.endsAt} />
          </div>
          <div>
            <label htmlFor="maxResponses" className="label">
              Maximum responses <span className="text-orizenn-subtle">(optional)</span>
            </label>
            <input id="maxResponses" name="maxResponses" type="number" min={1} step={1} defaultValue={values.maxResponses ?? ""} className={`input mt-1 ${fields.maxResponses ? "input-error" : ""}`} />
            <FieldError errors={fields.maxResponses} />
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-2">
        <SubmitButton pendingText={mode === "create" ? "Creating…" : "Saving…"}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
