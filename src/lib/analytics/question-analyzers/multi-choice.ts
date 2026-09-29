import type { QuestionDefinition } from "@/lib/forms/definitions";
import { percent, round } from "../metrics";
import type { DistributionBucket, MultiSelectBlock, QuestionAnswerData } from "../types";
import { baseBlock } from "./base";

/** MULTIPLE_CHOICE: selection frequency as a share of respondents (PRD §37). */
export function analyzeMultiChoice(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
): MultiSelectBlock {
  const selections = data?.jsonValues ?? [];
  const respondents = selections.length;
  const counts = new Map<string, number>();
  let totalSelections = 0;
  for (const arr of selections) {
    for (const v of new Set(arr)) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
      totalSelections += 1;
    }
  }

  const known = q.options.map((o) => o.value);
  const unknown = Array.from(counts.keys()).filter((v) => !known.includes(v));
  const items: DistributionBucket[] = [...q.options.map((o) => ({ value: o.value, label: o.label })), ...unknown.map((v) => ({ value: v, label: v }))]
    .map((o) => {
      const count = counts.get(o.value) ?? 0;
      return { value: o.value, label: o.label, count, percent: percent(count, respondents) };
    })
    .sort((a, b) => b.count - a.count);

  const accessibleSummary = respondents
    ? `${respondents} respondents. ${items
        .filter((i) => i.count > 0)
        .map((i) => `${i.percent}% selected “${i.label}”`)
        .join(", ")}.`
    : "No answers yet.";

  return {
    ...baseBlock(q, data, totalResponses),
    kind: "MULTI_SELECT_FREQUENCY",
    items,
    averageSelections: respondents ? round(totalSelections / respondents, 1) : null,
    accessibleSummary,
  };
}
