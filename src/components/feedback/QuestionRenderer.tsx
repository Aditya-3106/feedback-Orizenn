"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { FieldError } from "@/components/ui/primitives";
import type { QuestionDefinition } from "@/lib/forms/definitions";
import { cn } from "@/lib/utils/format";
import { QuestionNumber } from "./QuestionProgress";

export interface QuestionRendererProps {
  question: QuestionDefinition;
  /** 1-based position shown as "01 / 07". */
  index: number;
  total: number;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
  disabled?: boolean;
  /** Attached to the outer block so the form can scroll to the first error. */
  anchorId?: string;
}

function joinIds(...ids: Array<string | false | null | undefined>): string | undefined {
  const list = ids.filter(Boolean);
  return list.length ? list.join(" ") : undefined;
}

/** Wrapper shared by every question type: number, prompt, description, error. */
export function QuestionBlock({
  index,
  total,
  anchorId,
  heading,
  description,
  descriptionId,
  error,
  errorId,
  children,
}: {
  index: number;
  total: number;
  anchorId?: string;
  heading: ReactNode;
  description?: string | null;
  descriptionId: string;
  error?: string | null;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <section id={anchorId} className={cn("rise-in card px-5 py-6 sm:px-8 sm:py-8", error && "border-orizenn-danger/40")}>
      <div className="mb-4">
        <QuestionNumber index={index} total={total} />
      </div>
      {heading}
      {description ? (
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-orizenn-muted">
          {description}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
      <FieldError id={errorId} errors={error} />
    </section>
  );
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-orizenn-blue">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

const PROMPT_CLASS = "block font-display text-2xl leading-snug text-orizenn-ink sm:text-[1.75rem]";

export function QuestionRenderer(props: QuestionRendererProps) {
  const { question: q, index, total, value, onChange, error, disabled, anchorId } = props;
  const base = useId();
  const labelId = `${base}-label`;
  const inputId = `${base}-input`;
  const descId = `${base}-desc`;
  const errorId = `${base}-error`;
  const hintId = `${base}-hint`;
  const describedBy = joinIds(q.description && descId, error && errorId);

  const usesLabelElement = q.type === "SHORT_TEXT" || q.type === "LONG_TEXT" || q.type === "NUMBER" || q.type === "DROPDOWN";

  const heading = usesLabelElement ? (
    <label id={labelId} htmlFor={inputId} className={PROMPT_CLASS}>
      {q.text}
      {q.required ? <RequiredMark /> : null}
    </label>
  ) : (
    <p id={labelId} className={PROMPT_CLASS}>
      {q.text}
      {q.required ? <RequiredMark /> : null}
    </p>
  );

  const shared = { index, total, anchorId, heading, description: q.description, descriptionId: descId, error, errorId };

  switch (q.type) {
    case "RATING":
    case "SCALE": {
      const min = q.validation.min ?? (q.type === "RATING" ? 1 : 0);
      const max = q.validation.max ?? (q.type === "RATING" ? 5 : 10);
      return (
        <QuestionBlock {...shared}>
          <NumericChoice
            min={min}
            max={max}
            value={typeof value === "number" ? value : null}
            onChange={onChange}
            labelId={labelId}
            describedBy={describedBy}
            required={q.required}
            disabled={disabled}
            invalid={!!error}
          />
        </QuestionBlock>
      );
    }

    case "YES_NO":
      return (
        <QuestionBlock {...shared}>
          <RadioList
            name={q.id}
            labelId={labelId}
            describedBy={describedBy}
            required={q.required}
            disabled={disabled}
            invalid={!!error}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            selected={value === true ? "yes" : value === false ? "no" : null}
            onSelect={(v) => onChange(v === "yes")}
            inline
          />
        </QuestionBlock>
      );

    case "SINGLE_CHOICE":
      return (
        <QuestionBlock {...shared}>
          <RadioList
            name={q.id}
            labelId={labelId}
            describedBy={describedBy}
            required={q.required}
            disabled={disabled}
            invalid={!!error}
            options={q.options.map((o) => ({ value: o.value, label: o.label }))}
            selected={typeof value === "string" ? value : null}
            onSelect={onChange}
          />
        </QuestionBlock>
      );

    case "MULTIPLE_CHOICE": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const maxSel = q.validation.maxSelections;
      const minSel = q.validation.minSelections;
      const hint =
        maxSel != null && minSel != null && minSel > 0
          ? `Select ${minSel === maxSel ? minSel : `${minSel} to ${maxSel}`}.`
          : maxSel != null
            ? `Select up to ${maxSel}.`
            : "Select all that apply.";
      return (
        <QuestionBlock {...shared}>
          <div role="group" aria-labelledby={labelId} aria-describedby={joinIds(describedBy, hintId)} className="space-y-2">
            {q.options.map((o) => {
              const checked = selected.includes(o.value);
              const atCap = maxSel != null && selected.length >= maxSel && !checked;
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                    checked ? "border-orizenn-blue bg-orizenn-blue-soft" : "border-orizenn-border bg-orizenn-surface hover:bg-orizenn-bg",
                    (disabled || atCap) && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    name={q.id}
                    value={o.value}
                    checked={checked}
                    disabled={disabled || atCap}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, o.value]
                        : selected.filter((v) => v !== o.value);
                      onChange(q.options.filter((opt) => next.includes(opt.value)).map((opt) => opt.value));
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-orizenn-blue"
                  />
                  <span className="text-orizenn-ink">{o.label}</span>
                </label>
              );
            })}
          </div>
          <p id={hintId} className="hint mt-3">
            {hint}
          </p>
        </QuestionBlock>
      );
    }

    case "DROPDOWN":
      return (
        <QuestionBlock {...shared}>
          <select
            id={inputId}
            name={q.id}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
            disabled={disabled}
            required={q.required}
            aria-required={q.required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn("input", error && "input-error")}
          >
            <option value="">Select an option</option>
            {q.options.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </QuestionBlock>
      );

    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const cap = q.validation.maxLength ?? (q.type === "SHORT_TEXT" ? 300 : 3000);
      const text = typeof value === "string" ? value : "";
      const over = text.length > cap;
      const counter = (
        <p
          id={hintId}
          className={cn("hint mt-2 text-right tabular-nums", over && "text-orizenn-danger")}
          aria-live={over ? "polite" : undefined}
        >
          {text.length} / {cap}
        </p>
      );
      const inputProps = {
        id: inputId,
        name: q.id,
        value: text,
        disabled,
        required: q.required,
        "aria-required": q.required || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": joinIds(describedBy, hintId),
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
        className: cn("input", error && "input-error"),
      };
      return (
        <QuestionBlock {...shared}>
          {q.type === "SHORT_TEXT" ? (
            <input type="text" autoComplete="off" {...inputProps} />
          ) : (
            <textarea rows={5} {...inputProps} className={cn(inputProps.className, "min-h-32 resize-y leading-relaxed")} />
          )}
          {counter}
        </QuestionBlock>
      );
    }

    case "NUMBER": {
      const display = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
      return (
        <QuestionBlock {...shared}>
          <input
            id={inputId}
            name={q.id}
            type="number"
            inputMode="decimal"
            min={q.validation.min}
            max={q.validation.max}
            step="any"
            value={display}
            disabled={disabled}
            required={q.required}
            aria-required={q.required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return onChange(undefined);
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : raw);
            }}
            className={cn("input max-w-xs", error && "input-error")}
          />
          {q.validation.min != null || q.validation.max != null ? (
            <p className="hint mt-2">
              {q.validation.min != null && q.validation.max != null
                ? `Between ${q.validation.min} and ${q.validation.max}.`
                : q.validation.min != null
                  ? `At least ${q.validation.min}.`
                  : `At most ${q.validation.max}.`}
            </p>
          ) : null}
        </QuestionBlock>
      );
    }
  }
}

/* ───────────────────────── Rating / scale ───────────────────────── */

function NumericChoice({
  min,
  max,
  value,
  onChange,
  labelId,
  describedBy,
  required,
  disabled,
  invalid,
}: {
  min: number;
  max: number;
  value: number | null;
  onChange: (v: number) => void;
  labelId: string;
  describedBy?: string;
  required: boolean;
  disabled?: boolean;
  invalid: boolean;
}) {
  const values: number[] = [];
  for (let n = min; n <= max; n++) values.push(n);
  const wide = values.length > 7;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(max, (value ?? min - 1) + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(min, (value ?? max + 1) - 1);
    if (e.key === "Home") next = min;
    if (e.key === "End") next = max;
    if (next == null) return;
    e.preventDefault();
    onChange(next);
    const target = e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`);
    target?.focus();
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        onKeyDown={onKeyDown}
        className={cn("grid gap-2", wide && "grid-cols-6 sm:grid-cols-11")}
        style={wide ? undefined : { gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
      >
        {values.map((n) => {
          const checked = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              data-value={n}
              aria-checked={checked}
              aria-label={`${n} of ${max}`}
              tabIndex={checked || (value == null && n === min) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(n)}
              className={cn(
                "h-12 rounded-lg border font-mono text-base tabular-nums transition-colors",
                checked
                  ? "border-orizenn-blue bg-orizenn-blue text-white"
                  : "border-orizenn-border bg-orizenn-surface text-orizenn-ink hover:border-orizenn-ink/30",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-orizenn-subtle" aria-hidden="true">
        <span>{min} · Low</span>
        <span>{max} · High</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Radio list ───────────────────────── */

function RadioList({
  name,
  labelId,
  describedBy,
  required,
  disabled,
  invalid,
  options,
  selected,
  onSelect,
  inline,
}: {
  name: string;
  labelId: string;
  describedBy?: string;
  required: boolean;
  disabled?: boolean;
  invalid: boolean;
  options: Array<{ value: string; label: string }>;
  selected: string | null;
  onSelect: (v: string) => void;
  inline?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      className={inline ? "grid grid-cols-2 gap-2" : "space-y-2"}
    >
      {options.map((o) => {
        const checked = selected === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
              checked ? "border-orizenn-blue bg-orizenn-blue-soft" : "border-orizenn-border bg-orizenn-surface hover:bg-orizenn-bg",
              inline && "justify-center",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onSelect(o.value)}
              className={cn("h-4 w-4 shrink-0 accent-orizenn-blue", inline ? "mt-0" : "mt-0.5")}
            />
            <span className="text-orizenn-ink">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
