"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { FieldError, Notice } from "@/components/ui/primitives";
import type { FieldErrors } from "@/lib/api/errors";
import {
  RESPONDENT_FIELD_LABELS,
  type FormDefinition,
  type QuestionDefinition,
  type RespondentField,
} from "@/lib/forms/definitions";
import { cn } from "@/lib/utils/format";
import { validateAnswer, validateRespondentContext } from "@/lib/validation/submission";
import { FormIntro, StepProgress } from "./QuestionProgress";
import { PublicShell } from "./PublicShell";
import { QuestionBlock, QuestionRenderer } from "./QuestionRenderer";

/* ───────────────────────── Types ───────────────────────── */

export type PublicFormMode = "live" | "preview";
export type PublicFormLayout = "auto" | "scroll" | "steps";

export interface PublicFormProps {
  form: FormDefinition;
  /** Public link slug. Required in live mode; unused in preview. */
  slug?: string;
  mode?: PublicFormMode;
  /** "auto" = long-form up to 8 questions, one-per-step above that. */
  layout?: PublicFormLayout;
}

type Panel =
  | { kind: "respondent" }
  | { kind: "question"; question: QuestionDefinition; index: number }
  | { kind: "consent" };

type Status = "idle" | "submitting" | "done";

const STEP_THRESHOLD = 8;
const CONSENT_QUESTION = "May we use your feedback anonymously in presentations or product material?";
const CONSENT_ERROR = "Please tell us whether we may quote your feedback.";
const NETWORK_ERROR = "We couldn't submit your response. Your answers are still on this page.";
const BLOCKING_CODES = new Set(["FORM_CLOSED", "LINK_EXPIRED", "RESPONSE_LIMIT_REACHED", "DUPLICATE_SUBMISSION"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTOCOMPLETE: Record<RespondentField, string> = {
  name: "name",
  email: "email",
  college: "organization",
  branch: "off",
  year: "off",
  projectType: "off",
};

/* ───────────────────────── Helpers ───────────────────────── */

function newClientToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Anonymous campaigns never collect identity, even if configured (PRD §31). */
export function visibleRespondentFields(form: FormDefinition): RespondentField[] {
  const anonymous = form.campaign.responseMode === "ANONYMOUS";
  return form.campaign.respondentFields.filter((f) => !anonymous || (f !== "name" && f !== "email"));
}

function isRespondentRequired(form: FormDefinition, field: RespondentField): boolean {
  if (form.campaign.responseMode === "ANONYMOUS") return false;
  return field !== "email" && field !== "projectType";
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

/* ───────────────────────── Component ───────────────────────── */

export function PublicForm({ form, slug, mode = "live", layout = "auto" }: PublicFormProps) {
  const router = useRouter();
  const idBase = useId();
  const preview = mode === "preview";

  const fields = useMemo(() => visibleRespondentFields(form), [form]);
  const stepMode = layout === "steps" || (layout === "auto" && form.questions.length > STEP_THRESHOLD);

  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    if (fields.length) list.push({ kind: "respondent" });
    form.questions.forEach((question, i) => list.push({ kind: "question", question, index: i + 1 }));
    if (form.campaign.requireQuoteConsent) list.push({ kind: "consent" });
    return list;
  }, [fields, form]);

  // Field keys in document order, used to locate the first error.
  const orderedKeys = useMemo(
    () => [
      ...fields.map((f) => `respondent.${f}`),
      ...form.questions.map((q) => `answers.${q.id}`),
      ...(form.campaign.requireQuoteConsent ? ["consentToQuote"] : []),
    ],
    [fields, form],
  );

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [respondent, setRespondent] = useState<Partial<Record<RespondentField, string>>>({});
  const [consent, setConsent] = useState<boolean | undefined>(undefined);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null);
  const [step, setStep] = useState(0);

  const submittingRef = useRef(false);
  const clientTokenRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const focusKeyRef = useRef<string | null>(null);

  useEffect(() => {
    startedAtRef.current ??= new Date().toISOString();
  }, []);

  const anchorFor = useCallback((key: string) => `${idBase}-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`, [idBase]);

  const panelIndexFor = useCallback(
    (key: string): number => {
      if (key.startsWith("respondent.")) return panels.findIndex((p) => p.kind === "respondent");
      if (key === "consentToQuote") return panels.findIndex((p) => p.kind === "consent");
      const qid = key.slice("answers.".length);
      return panels.findIndex((p) => p.kind === "question" && p.question.id === qid);
    },
    [panels],
  );

  // After errors render, scroll to and focus the first offending field.
  useEffect(() => {
    const key = focusKeyRef.current;
    if (!key) return;
    const el = document.getElementById(anchorFor(key));
    if (!el) return;
    focusKeyRef.current = null;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = el.querySelector<HTMLElement>(
      'input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
    );
    focusable?.focus({ preventScroll: true });
  }, [errors, step, anchorFor]);

  const showErrors = useCallback(
    (next: FieldErrors) => {
      setErrors(next);
      const first = orderedKeys.find((k) => next[k]?.length);
      if (!first) return;
      focusKeyRef.current = first;
      if (stepMode) {
        const idx = panelIndexFor(first);
        if (idx >= 0) setStep(idx);
      }
    },
    [orderedKeys, panelIndexFor, stepMode],
  );

  const clearError = useCallback((key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /* ───────── Payload + validation ───────── */

  const respondentPayload = useCallback(() => {
    const out: Partial<Record<RespondentField, string>> = {};
    for (const f of fields) {
      const v = respondent[f]?.trim();
      if (v) out[f] = v;
    }
    return out;
  }, [fields, respondent]);

  const validateRespondent = useCallback((): FieldErrors => {
    const payload = respondentPayload();
    const errs = validateRespondentContext(form, payload);
    if (fields.includes("email") && payload.email && !EMAIL_RE.test(payload.email)) {
      errs["respondent.email"] = ["Enter a valid email."];
    }
    return errs;
  }, [fields, form, respondentPayload]);

  const validateQuestions = useCallback(
    (questions: QuestionDefinition[]): FieldErrors => {
      const errs: FieldErrors = {};
      for (const q of questions) {
        const { error } = validateAnswer(q, answers[q.id]);
        if (error) errs[`answers.${q.id}`] = [error];
      }
      return errs;
    },
    [answers],
  );

  const validateConsent = useCallback((): FieldErrors => {
    if (form.campaign.requireQuoteConsent && typeof consent !== "boolean") {
      return { consentToQuote: [CONSENT_ERROR] };
    }
    return {};
  }, [consent, form.campaign.requireQuoteConsent]);

  const validatePanel = useCallback(
    (panel: Panel): FieldErrors => {
      switch (panel.kind) {
        case "respondent":
          return validateRespondent();
        case "question":
          return validateQuestions([panel.question]);
        case "consent":
          return validateConsent();
      }
    },
    [validateConsent, validateQuestions, validateRespondent],
  );

  const validateAll = useCallback(
    (): FieldErrors => ({ ...validateRespondent(), ...validateQuestions(form.questions), ...validateConsent() }),
    [form.questions, validateConsent, validateQuestions, validateRespondent],
  );

  /* ───────── Submit ───────── */

  const submit = useCallback(async () => {
    if (preview || !slug) return;
    if (submittingRef.current || status === "done") return;

    const clientErrors = validateAll();
    if (Object.keys(clientErrors).length) {
      showErrors(clientErrors);
      return;
    }

    submittingRef.current = true;
    setStatus("submitting");
    setFailure(null);
    clientTokenRef.current ??= newClientToken();

    const cleanAnswers: Record<string, unknown> = {};
    for (const q of form.questions) {
      if (!isBlank(answers[q.id])) cleanAnswers[q.id] = answers[q.id];
    }

    const body = {
      clientToken: clientTokenRef.current,
      startedAt: startedAtRef.current ?? new Date().toISOString(),
      website,
      respondent: respondentPayload(),
      consentToQuote: form.campaign.requireQuoteConsent ? consent : undefined,
      answers: cleanAnswers,
    };

    try {
      const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const envelope = (json ?? {}) as {
        success?: boolean;
        error?: { code?: string; message?: string; fields?: FieldErrors };
      };

      if (res.ok && envelope.success) {
        setStatus("done");
        router.push(`/f/${slug}/success`);
        return;
      }

      const err = envelope.error;
      if (err?.fields && Object.keys(err.fields).length) {
        const mapped: FieldErrors = {};
        const general: string[] = [];
        for (const [key, messages] of Object.entries(err.fields)) {
          if (orderedKeys.includes(key)) mapped[key] = messages;
          else general.push(...messages);
        }
        showErrors(mapped);
        setFailure(
          general.length
            ? { message: general.join(" "), retry: true }
            : Object.keys(mapped).length
              ? null
              : { message: err.message ?? NETWORK_ERROR, retry: true },
        );
      } else if (err?.code && BLOCKING_CODES.has(err.code)) {
        setFailure({ message: err.message ?? NETWORK_ERROR, retry: false });
      } else if (err?.message) {
        setFailure({ message: err.message, retry: true });
      } else {
        setFailure({ message: NETWORK_ERROR, retry: true });
      }
      setStatus("idle");
    } catch {
      setFailure({ message: NETWORK_ERROR, retry: true });
      setStatus("idle");
    } finally {
      submittingRef.current = false;
    }
  }, [
    answers,
    consent,
    form.campaign.requireQuoteConsent,
    form.questions,
    orderedKeys,
    preview,
    respondentPayload,
    router,
    showErrors,
    slug,
    status,
    validateAll,
    website,
  ]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit();
  };

  /* ───────── Steps ───────── */

  const lastStep = panels.length - 1;
  const onNext = () => {
    const panel = panels[step];
    if (!panel) return;
    const errs = validatePanel(panel);
    if (Object.keys(errs).length) {
      showErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(lastStep, s + 1));
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        /* jsdom */
      }
    }
  };
  const onBack = () => setStep((s) => Math.max(0, s - 1));

  /* ───────── Renderers ───────── */

  const total = form.questions.length;
  const submitting = status !== "idle";
  const blocked = failure != null && !failure.retry;

  const renderRespondent = () => (
    <section id={anchorFor("respondent")} className="rise-in card px-5 py-6 sm:px-8 sm:py-8">
      <p className="mono-label">About you</p>
      <h2 className="mt-2 font-display text-2xl leading-snug text-orizenn-ink">A little context first.</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {fields.map((f) => {
          const key = `respondent.${f}`;
          const inputId = `${idBase}-r-${f}`;
          const errorId = `${inputId}-error`;
          const required = isRespondentRequired(form, f);
          const error = errors[key]?.join(" ");
          return (
            <div key={f} id={anchorFor(key)} className={f === "name" || f === "email" ? "sm:col-span-2" : undefined}>
              <label htmlFor={inputId} className="label">
                {RESPONDENT_FIELD_LABELS[f]}
                {required ? (
                  <>
                    <span aria-hidden="true" className="ml-1 text-orizenn-blue">
                      *
                    </span>
                    <span className="sr-only"> (required)</span>
                  </>
                ) : (
                  <span className="ml-1.5 font-normal text-orizenn-subtle">(optional)</span>
                )}
              </label>
              <input
                id={inputId}
                name={key}
                type={f === "email" ? "email" : "text"}
                inputMode={f === "email" ? "email" : "text"}
                autoComplete={AUTOCOMPLETE[f]}
                value={respondent[f] ?? ""}
                required={required}
                aria-required={required || undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                disabled={submitting}
                onChange={(e) => {
                  const v = e.target.value;
                  setRespondent((prev) => ({ ...prev, [f]: v }));
                  clearError(key);
                }}
                className={cn("input mt-1.5", error && "input-error")}
              />
              <FieldError id={errorId} errors={error} />
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderQuestion = (q: QuestionDefinition, index: number) => {
    const key = `answers.${q.id}`;
    return (
      <QuestionRenderer
        key={q.id}
        question={q}
        index={index}
        total={total}
        value={answers[q.id]}
        error={errors[key]?.join(" ")}
        disabled={submitting}
        anchorId={anchorFor(key)}
        onChange={(v) => {
          setAnswers((prev) => ({ ...prev, [q.id]: v }));
          clearError(key);
        }}
      />
    );
  };

  const renderConsent = () => {
    const key = "consentToQuote";
    const labelId = `${idBase}-consent-label`;
    const descId = `${idBase}-consent-desc`;
    const errorId = `${idBase}-consent-error`;
    const error = errors[key]?.join(" ");
    return (
      <QuestionBlock
        index={total + 1}
        total={total + 1}
        anchorId={anchorFor(key)}
        heading={
          <p id={labelId} className="block font-display text-2xl leading-snug text-orizenn-ink sm:text-[1.75rem]">
            {CONSENT_QUESTION}
            <span aria-hidden="true" className="ml-1 text-orizenn-blue">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </p>
        }
        description="Your name is never attached to a quote."
        descriptionId={descId}
        error={error}
        errorId={errorId}
      >
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={[descId, error ? errorId : null].filter(Boolean).join(" ")}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          className="grid grid-cols-2 gap-2"
        >
          {[
            { v: true, label: "Yes" },
            { v: false, label: "No" },
          ].map((o) => {
            const checked = consent === o.v;
            return (
              <label
                key={o.label}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                  checked ? "border-orizenn-blue bg-orizenn-blue-soft" : "border-orizenn-border bg-orizenn-surface hover:bg-orizenn-bg",
                  submitting && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="consentToQuote"
                  value={o.label.toLowerCase()}
                  checked={checked}
                  disabled={submitting}
                  onChange={() => {
                    setConsent(o.v);
                    clearError(key);
                  }}
                  className="h-4 w-4 shrink-0 accent-orizenn-blue"
                />
                <span className="text-orizenn-ink">{o.label}</span>
              </label>
            );
          })}
        </div>
      </QuestionBlock>
    );
  };

  const renderPanel = (panel: Panel) => {
    switch (panel.kind) {
      case "respondent":
        return renderRespondent();
      case "question":
        return renderQuestion(panel.question, panel.index);
      case "consent":
        return renderConsent();
    }
  };

  const submitControl = preview ? (
    <button type="button" disabled className="btn-secondary w-full sm:w-auto" aria-disabled="true">
      Preview — submissions are disabled
    </button>
  ) : (
    <button
      type="submit"
      className="btn-primary w-full sm:w-auto"
      disabled={submitting || blocked}
      aria-busy={status === "submitting" || undefined}
    >
      {status === "idle" ? "Submit Feedback" : "Submitting…"}
    </button>
  );

  const failureNotice = failure ? (
    <Notice
      tone="danger"
      action={
        failure.retry ? (
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => void submit()} disabled={submitting}>
            Try Again
          </button>
        ) : undefined
      }
    >
      {failure.message}
    </Notice>
  ) : null;

  const banner = preview ? (
    <div className="border-b border-orizenn-border bg-orizenn-ink text-white">
      <div className="mx-auto flex h-9 w-full max-w-2xl items-center justify-between px-4 text-xs sm:px-6">
        <span className="font-mono uppercase tracking-[0.08em]">Preview of v{form.versionNumber}</span>
        <Link href={`/admin/campaigns/${form.campaign.id}/builder`} className="underline-offset-2 hover:underline">
          Back to builder
        </Link>
      </div>
    </div>
  ) : undefined;

  const honeypot = (
    <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor={`${idBase}-website`}>Website</label>
      <input
        id={`${idBase}-website`}
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
    </div>
  );

  /* ───────── Layout ───────── */

  if (stepMode) {
    const panel = panels[step];
    const isLast = step === lastStep;
    return (
      <PublicShell banner={banner}>
        <form onSubmit={onSubmit} noValidate className="relative space-y-8">
          {honeypot}
          {step === 0 ? (
            <FormIntro form={form} />
          ) : (
            <p className="font-display text-xl text-orizenn-muted">{form.campaign.name}</p>
          )}
          <StepProgress current={step + 1} total={panels.length} />
          <div key={step}>{panel ? renderPanel(panel) : null}</div>
          {failureNotice}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="btn-ghost" onClick={onBack} disabled={step === 0 || submitting}>
              Back
            </button>
            {isLast ? (
              submitControl
            ) : (
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={onNext} disabled={submitting}>
                Next
              </button>
            )}
          </div>
        </form>
      </PublicShell>
    );
  }

  return (
    <PublicShell banner={banner}>
      <form onSubmit={onSubmit} noValidate className="relative space-y-8">
        {honeypot}
        <FormIntro form={form} />
        <div className="space-y-6">{panels.map((p, i) => <div key={p.kind === "question" ? p.question.id : `${p.kind}-${i}`}>{renderPanel(p)}</div>)}</div>
        {failureNotice}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {submitControl}
          {!preview ? <p className="hint">Nothing is saved until you submit.</p> : null}
        </div>
      </form>
    </PublicShell>
  );
}
