import type { QuestionDefinition } from "@/lib/forms/definitions";
import { bucketize, percent, weightedAverage, weightedMax, weightedMedian, weightedMin, weightedTotal } from "../metrics";
import type { NumberSummaryBlock, QuestionAnswerData } from "../types";
import { baseBlock } from "./base";

/** NUMBER: average, median, min, max and a bucketed distribution (PRD §37). */
export function analyzeNumber(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
): NumberSummaryBlock {
  const values = (data?.numberCounts ?? []).filter((v) => v.count > 0);
  const total = weightedTotal(values);
  const average = weightedAverage(values);
  const median = weightedMedian(values);
  const min = weightedMin(values);
  const max = weightedMax(values);

  const buckets = bucketize(values).map((b) => ({
    value: `${b.from}-${b.to}`,
    label: b.label,
    count: b.count,
    percent: percent(b.count, total),
  }));

  const accessibleSummary = total
    ? `${total} answers. Average ${average}, median ${median}, ranging from ${min} to ${max}.`
    : "No answers yet.";

  return {
    ...baseBlock(q, data, totalResponses),
    kind: "NUMBER_SUMMARY",
    average,
    median,
    min,
    max,
    buckets,
    accessibleSummary,
  };
}
