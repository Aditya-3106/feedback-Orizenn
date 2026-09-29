import type { QuestionDefinition } from "@/lib/forms/definitions";
import { percent, weightedAverage, weightedMedian, weightedTotal } from "../metrics";
import type { DistributionBucket, QuestionAnswerData, RatingDistributionBlock } from "../types";
import { baseBlock } from "./base";

/** RATING and SCALE share the same analysis; the block kind differs. */
export function analyzeRating(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
): RatingDistributionBlock {
  const isRating = q.type === "RATING";
  const min = q.validation.min ?? (isRating ? 1 : 0);
  const max = q.validation.max ?? (isRating ? 5 : 10);
  const counts = new Map<number, number>();
  for (const c of data?.numberCounts ?? []) counts.set(c.value, (counts.get(c.value) ?? 0) + c.count);

  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i).map((value) => ({
    value,
    count: counts.get(value) ?? 0,
  }));
  const total = weightedTotal(values);
  const distribution: DistributionBucket[] = values.map((v) => ({
    value: String(v.value),
    label: String(v.value),
    count: v.count,
    percent: percent(v.count, total),
  }));

  const average = weightedAverage(values);
  const median = weightedMedian(values);
  const topTwo = values.slice(-2).reduce((s, v) => s + v.count, 0);
  const favourablePercent = total ? percent(topTwo, total) : null;

  const summaryParts = distribution
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((d) => `${d.percent}% selected ${d.label}`);
  const accessibleSummary = total
    ? `${total} answers, average ${average?.toFixed(1)} out of ${max}. ${summaryParts.join(", ")}.`
    : "No answers yet.";

  return {
    ...baseBlock(q, data, totalResponses),
    kind: isRating ? "RATING_DISTRIBUTION" : "SCALE_DISTRIBUTION",
    average,
    median,
    min,
    max,
    distribution,
    favourablePercent,
    accessibleSummary,
  };
}
