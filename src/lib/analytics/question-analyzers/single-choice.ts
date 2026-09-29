import type { QuestionDefinition } from "@/lib/forms/definitions";
import { percent } from "../metrics";
import type { DistributionBucket, OptionDistributionBlock, QuestionAnswerData } from "../types";
import { baseBlock } from "./base";

/** SINGLE_CHOICE and DROPDOWN: count + percentage per option (PRD §37). */
export function analyzeSingleChoice(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
): OptionDistributionBlock {
  const counts = new Map<string, number>();
  for (const c of data?.textCounts ?? []) counts.set(c.value, (counts.get(c.value) ?? 0) + c.count);
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  // Keep the option order as authored; append any unknown legacy values at the end.
  const known = q.options.map((o) => o.value);
  const unknown = Array.from(counts.keys()).filter((v) => !known.includes(v));

  const distribution: DistributionBucket[] = [...q.options.map((o) => ({ value: o.value, label: o.label })), ...unknown.map((v) => ({ value: v, label: v }))].map(
    (o) => {
      const count = counts.get(o.value) ?? 0;
      return { value: o.value, label: o.label, count, percent: percent(count, total) };
    },
  );

  const top = distribution.reduce<DistributionBucket | null>((best, d) => (d.count > (best?.count ?? 0) ? d : best), null);
  const accessibleSummary = total
    ? `${total} answers. ${distribution
        .filter((d) => d.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((d) => `${d.percent}% chose “${d.label}”`)
        .join(", ")}.`
    : "No answers yet.";

  return {
    ...baseBlock(q, data, totalResponses),
    kind: q.analyticsType === "SEGMENT_DISTRIBUTION" ? "SEGMENT_DISTRIBUTION" : "OPTION_DISTRIBUTION",
    distribution,
    top: top && top.count > 0 ? top : null,
    accessibleSummary,
  };
}
