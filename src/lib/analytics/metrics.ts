/**
 * Central, deterministic metric helpers (PRD §89, §129). Every number shown on
 * a dashboard, in an insight or in an export must come from here or from SQL —
 * never from an AI model.
 */

export function percent(part: number, whole: number, digits = 0): number {
  if (!whole) return 0;
  const factor = 10 ** digits;
  return Math.round((part / whole) * 100 * factor) / factor;
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface WeightedValue {
  value: number;
  count: number;
}

export function weightedTotal(values: readonly WeightedValue[]): number {
  return values.reduce((sum, v) => sum + v.count, 0);
}

export function weightedAverage(values: readonly WeightedValue[]): number | null {
  const total = weightedTotal(values);
  if (!total) return null;
  const sum = values.reduce((acc, v) => acc + v.value * v.count, 0);
  return round(sum / total, 2);
}

export function weightedMedian(values: readonly WeightedValue[]): number | null {
  const total = weightedTotal(values);
  if (!total) return null;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const mid = total / 2;
  let running = 0;
  for (let i = 0; i < sorted.length; i++) {
    running += sorted[i].count;
    if (running > mid) return sorted[i].value;
    if (running === mid) {
      // Even total: average this value with the next value that has count > 0.
      const next = sorted.slice(i + 1).find((v) => v.count > 0);
      return next ? round((sorted[i].value + next.value) / 2, 2) : sorted[i].value;
    }
  }
  return sorted[sorted.length - 1]?.value ?? null;
}

export function weightedMin(values: readonly WeightedValue[]): number | null {
  const present = values.filter((v) => v.count > 0);
  return present.length ? Math.min(...present.map((v) => v.value)) : null;
}

export function weightedMax(values: readonly WeightedValue[]): number | null {
  const present = values.filter((v) => v.count > 0);
  return present.length ? Math.max(...present.map((v) => v.value)) : null;
}

export function completionRate(completed: number, started: number): number | null {
  if (!started) return null;
  return percent(completed, started);
}

/** Bucket arbitrary numeric values into up to `maxBuckets` equal-width ranges. */
export function bucketize(
  values: readonly WeightedValue[],
  maxBuckets = 6,
): Array<{ label: string; from: number; to: number; count: number }> {
  const present = values.filter((v) => v.count > 0);
  if (!present.length) return [];
  const min = Math.min(...present.map((v) => v.value));
  const max = Math.max(...present.map((v) => v.value));
  if (min === max) return [{ label: String(min), from: min, to: max, count: weightedTotal(present) }];

  const distinct = new Set(present.map((v) => v.value)).size;
  if (distinct <= maxBuckets && present.every((v) => Number.isInteger(v.value))) {
    return [...present]
      .sort((a, b) => a.value - b.value)
      .map((v) => ({ label: String(v.value), from: v.value, to: v.value, count: v.count }));
  }

  const width = (max - min) / maxBuckets;
  const buckets = Array.from({ length: maxBuckets }, (_, i) => {
    const from = min + i * width;
    const to = i === maxBuckets - 1 ? max : min + (i + 1) * width;
    return { label: `${fmt(from)}–${fmt(to)}`, from, to, count: 0 };
  });
  for (const v of present) {
    let idx = Math.floor((v.value - min) / width);
    if (idx >= maxBuckets) idx = maxBuckets - 1;
    buckets[idx].count += v.count;
  }
  return buckets;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Minimum responses before percentages are treated as meaningful (PRD §43, §100). */
export const MIN_RESPONSES_FOR_INSIGHT = 5;

export function describeShare(count: number, total: number, noun = "respondents"): string {
  return `${count} of ${total} ${noun} (${percent(count, total)}%)`;
}
