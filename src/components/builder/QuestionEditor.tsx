"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmAction } from "@/components/ui/client";
import { FieldError, Notice } from "@/components/ui/primitives";
import { definitionToDraft } from "@/lib/forms/clone";
import {
  ANALYTICS_TYPE_LABELS,
  QUESTION_CATEGORIES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  allowedAnalyticsTypes,
  defaultAnalyticsType,
  defaultValidation,
  isChoiceType,
  type QuestionDefinition,
  type QuestionType,
} from "@/lib/forms/definitions";
import { questionDraftSchema, type QuestionDraftInput } from "@/lib/validation/question";
import { zodFieldErrors } from "@/lib/api/response";
import type { FieldErrors } from "@/lib/api/errors";
import type { AnalyticsMeta, AnalyticsType, ValidationRules } from "@/lib/forms/definitions";
import { OptionEditor } from "./OptionEditor";

/** Editor state: same shape the Zod schema accepts, with concrete number types for inputs. */
interface Draft {
  text: string;
  description?: string;
  type: QuestionType;
  required: boolean;
  category?: string;
  analyticsType?: AnalyticsType;
  comparableKey?: string;
  validation: ValidationRules;
  analytics: AnalyticsMeta;
  options: Array<{ label: string; value?: string }>;
}

function toDraft(q: QuestionDefinition): Draft {
  const d = definitionToDraft(q);
  return {
    text: d.text,
    description: d.description,
    type: d.type,
    required: d.required,
    category: d.category,
    analyticsType: d.analyticsType,
    comparableKey: d.comparableKey,
    validation: { ...q.validation },
    analytics: { ...q.analytics },
    options: d.options.map((o) => ({ label: o.label, value: o.value })),
  };
}

export function QuestionEditor({
  question,
  index,
  saving,
  serverErrors,
  onSave,
  onDelete,
  onDuplicate,
  onDirtyChange,
}: {
  question: QuestionDefinition;
  index: number;
  saving: boolean;
  serverErrors?: FieldErrors;
  onSave: (draft: QuestionDraftInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(question));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [advanced, setAdvanced] = useState(false);
  const initialJson = useMemo(() => JSON.stringify(toDraft(question)), [question]);
  const dirty = JSON.stringify(draft) !== initialJson;

  // The parent remounts this editor (key = question id + revision) whenever the
  // question changes, so no state re-sync effect is needed here.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setValidation = (k: string, v: string) =>
    setDraft((d) => ({ ...d, validation: { ...d.validation, [k]: v === "" ? undefined : Number(v) } }));

  const changeType = (type: QuestionType) => {
    setDraft((d) => ({
      ...d,
      type,
      options: isChoiceType(type) ? (d.options.length ? d.options : [{ label: "" }, { label: "" }]) : [],
      validation: defaultValidation(type),
      analyticsType: d.analyticsType && allowedAnalyticsTypes(type).includes(d.analyticsType) ? d.analyticsType : defaultAnalyticsType(type),
    }));
  };

  const allErrors = { ...errors, ...(serverErrors ?? {}) };

  async function save() {
    const parsed = questionDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    await onSave(draft);
  }

  const type = draft.type;
  const v = draft.validation;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono-label">Question {String(index + 1).padStart(2, "0")}</div>
          <div className="hint mt-0.5 font-mono">{question.key}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate} disabled={saving}>
            Duplicate
          </button>
          <ConfirmAction
            title="Delete this question?"
            description="This only affects the draft version. Published versions are never changed."
            confirmLabel="Delete"
            tone="danger"
            onConfirm={onDelete}
            trigger={(open) => (
              <button type="button" className="btn-ghost btn-sm text-orizenn-danger" onClick={open} disabled={saving}>
                Delete
              </button>
            )}
          />
        </div>
      </div>

      {allErrors._form ? <Notice tone="danger">{allErrors._form.join(" ")}</Notice> : null}

      <div>
        <label htmlFor="q-text" className="label">
          Question text
        </label>
        <textarea id="q-text" rows={2} className={`input mt-1 text-base ${allErrors.text ? "input-error" : ""}`} value={draft.text} onChange={(e) => set("text", e.target.value)} placeholder="How useful was the Orizenn analysis?" />
        <FieldError errors={allErrors.text} />
      </div>

      <div>
        <label htmlFor="q-desc" className="label">
          Help text <span className="text-orizenn-subtle">(optional)</span>
        </label>
        <input id="q-desc" className="input mt-1" value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Shown under the question." />
        <FieldError errors={allErrors.description} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="q-type" className="label">
            Type
          </label>
          <select id="q-type" className="input mt-1" value={type} onChange={(e) => changeType(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pt-7 text-sm">
          <input type="checkbox" checked={draft.required ?? true} onChange={(e) => set("required", e.target.checked)} />
          Required
        </label>
      </div>

      {isChoiceType(type) ? <OptionEditor options={draft.options} onChange={(o) => set("options", o)} errors={allErrors.options} /> : null}

      {type === "RATING" || type === "SCALE" || type === "NUMBER" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="q-min" className="label">
              Minimum
            </label>
            <input id="q-min" type="number" className="input mt-1" value={v.min ?? ""} onChange={(e) => setValidation("min", e.target.value)} />
            <FieldError errors={allErrors["validation.min"]} />
          </div>
          <div>
            <label htmlFor="q-max" className="label">
              Maximum
            </label>
            <input id="q-max" type="number" className="input mt-1" value={v.max ?? ""} onChange={(e) => setValidation("max", e.target.value)} />
            <FieldError errors={allErrors["validation.max"]} />
          </div>
        </div>
      ) : null}

      {type === "SHORT_TEXT" || type === "LONG_TEXT" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="q-minlen" className="label">
              Minimum characters
            </label>
            <input id="q-minlen" type="number" min={0} className="input mt-1" value={v.minLength ?? ""} onChange={(e) => setValidation("minLength", e.target.value)} />
            <FieldError errors={allErrors["validation.minLength"]} />
          </div>
          <div>
            <label htmlFor="q-maxlen" className="label">
              Maximum characters
            </label>
            <input id="q-maxlen" type="number" min={1} className="input mt-1" value={v.maxLength ?? ""} onChange={(e) => setValidation("maxLength", e.target.value)} />
            <FieldError errors={allErrors["validation.maxLength"]} />
          </div>
        </div>
      ) : null}

      {type === "MULTIPLE_CHOICE" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="q-minsel" className="label">
              Minimum selections
            </label>
            <input id="q-minsel" type="number" min={0} className="input mt-1" value={v.minSelections ?? ""} onChange={(e) => setValidation("minSelections", e.target.value)} />
          </div>
          <div>
            <label htmlFor="q-maxsel" className="label">
              Maximum selections
            </label>
            <input id="q-maxsel" type="number" min={1} className="input mt-1" value={v.maxSelections ?? ""} onChange={(e) => setValidation("maxSelections", e.target.value)} />
            <FieldError errors={allErrors["validation.maxSelections"]} />
          </div>
        </div>
      ) : null}

      <div className="border-t border-orizenn-border pt-4">
        <button type="button" className="flex w-full items-center justify-between text-left text-sm font-medium text-orizenn-ink" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
          Advanced analytics
          <span className="hint">{advanced ? "Hide" : "Show"}</span>
        </button>
        <p className="hint mt-1">The dashboard is generated from this metadata. Defaults are sensible; change them only when you need to.</p>
        {advanced ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="q-cat" className="label">
                Category
              </label>
              <input id="q-cat" list="q-cat-list" className="input mt-1" value={draft.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="Usability" />
              <datalist id="q-cat-list">
                {QUESTION_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="q-at" className="label">
                Analytics type
              </label>
              <select id="q-at" className="input mt-1" value={draft.analyticsType ?? defaultAnalyticsType(type)} onChange={(e) => set("analyticsType", e.target.value as Draft["analyticsType"])}>
                {allowedAnalyticsTypes(type).map((a) => (
                  <option key={a} value={a}>
                    {ANALYTICS_TYPE_LABELS[a]}
                  </option>
                ))}
              </select>
              <FieldError errors={allErrors.analyticsType} />
            </div>
            <div>
              <label htmlFor="q-ck" className="label">
                Comparable key
              </label>
              <input id="q-ck" className="input mt-1 font-mono text-xs" value={draft.comparableKey ?? ""} onChange={(e) => set("comparableKey", e.target.value.toLowerCase())} placeholder="analysis_usefulness" />
              <p className="hint mt-1">Same key across versions enables “what changed” comparisons.</p>
              <FieldError errors={allErrors.comparableKey} />
            </div>
            <div>
              <label htmlFor="q-dp" className="label">
                Display priority
              </label>
              <input id="q-dp" type="number" min={0} max={1000} className="input mt-1" value={draft.analytics.displayPriority ?? 100} onChange={(e) => set("analytics", { ...draft.analytics, displayPriority: Number(e.target.value) })} />
              <p className="hint mt-1">Lower shows first on the dashboard.</p>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={draft.analytics.showInSummary ?? true} onChange={(e) => set("analytics", { ...draft.analytics, showInSummary: e.target.checked })} />
              Include in the dashboard summary and AI insights
            </label>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-orizenn-border pt-4">
        <span className="hint">{dirty ? "Unsaved changes" : "Saved"}</span>
        <button type="submit" className="btn-primary" disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save question"}
        </button>
      </div>
    </form>
  );
}
