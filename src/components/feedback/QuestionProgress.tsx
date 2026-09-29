import type { FormDefinition } from "@/lib/forms/definitions";

const DEFAULT_INTRO = "We want to understand what your experience actually looked like.";

export function padIndex(n: number): string {
  return String(n).padStart(2, "0");
}

/** Mono "01 / 07" marker shown at the top of every question block. */
export function QuestionNumber({ index, total }: { index: number; total: number }) {
  return (
    <span
      className="font-mono text-[11px] tracking-[0.08em] text-orizenn-subtle tabular-nums"
      aria-label={`Question ${index} of ${total}`}
    >
      {padIndex(index)} / {padIndex(total)}
    </span>
  );
}

/** Slim progress rail used by the step-based layout. */
export function StepProgress({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label="Form progress"
        className="h-1 flex-1 overflow-hidden rounded-full bg-orizenn-border"
      >
        <div className="h-full bg-orizenn-blue transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <span className="font-mono text-[11px] tracking-[0.08em] text-orizenn-subtle tabular-nums">
        {padIndex(current)} / {padIndex(total)}
      </span>
    </div>
  );
}

/** Campaign name, intro copy and the "n minutes · n questions" line. */
export function FormIntro({ form }: { form: FormDefinition }) {
  const count = form.questions.length;
  const minutes = form.estimatedMinutes ?? Math.max(1, Math.ceil(count / 4));
  const anonymous = form.campaign.responseMode === "ANONYMOUS";
  return (
    <section className="rise-in">
      <h1 className="font-display text-4xl leading-[1.05] text-orizenn-ink sm:text-5xl">{form.campaign.name}</h1>
      <p className="mt-5 max-w-prose text-base leading-relaxed text-orizenn-muted sm:text-lg">
        {form.introText?.trim() || DEFAULT_INTRO}
      </p>
      <p className="mono-label mt-6">
        {minutes} {minutes === 1 ? "minute" : "minutes"} · {count} {count === 1 ? "question" : "questions"}
      </p>
      {anonymous ? <p className="mt-2 text-sm text-orizenn-muted">Your responses are anonymous.</p> : null}
    </section>
  );
}
