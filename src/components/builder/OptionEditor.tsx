"use client";

import { FieldError } from "@/components/ui/primitives";

export interface OptionInput {
  label: string;
  value?: string;
}

export function OptionEditor({
  options,
  onChange,
  errors,
}: {
  options: OptionInput[];
  onChange: (next: OptionInput[]) => void;
  errors?: string[];
}) {
  const update = (i: number, label: string) => onChange(options.map((o, j) => (j === i ? { ...o, label } : o)));
  const remove = (i: number) => onChange(options.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="label">Options</div>
      <p className="hint">Between 2 and 20. Values are derived from labels automatically.</p>
      <ol className="mt-2 space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-6 font-mono text-[11px] text-orizenn-subtle">{String(i + 1).padStart(2, "0")}</span>
            <input aria-label={`Option ${i + 1}`} className="input" value={o.label} onChange={(e) => update(i, e.target.value)} placeholder="Option label" />
            <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move option ${i + 1} up`}>
              ↑
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === options.length - 1} aria-label={`Move option ${i + 1} down`}>
              ↓
            </button>
            <button type="button" className="btn-ghost btn-sm text-orizenn-danger" onClick={() => remove(i)} aria-label={`Remove option ${i + 1}`}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => onChange([...options, { label: "" }])} disabled={options.length >= 20}>
        + Add option
      </button>
      <FieldError errors={errors} />
    </div>
  );
}
