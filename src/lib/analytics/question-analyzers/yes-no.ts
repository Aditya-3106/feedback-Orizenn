import type { QuestionDefinition } from "@/lib/forms/definitions";
import { percent } from "../metrics";
import type { QuestionAnswerData, YesNoBlock } from "../types";
import { baseBlock } from "./base";

export function analyzeYesNo(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
): YesNoBlock {
  const yes = data?.booleanCounts?.yes ?? 0;
  const no = data?.booleanCounts?.no ?? 0;
  const total = yes + no;
  const yesPercent = total ? percent(yes, total) : null;
  const accessibleSummary = total
    ? `${total} answers: ${yes} said yes (${yesPercent}%), ${no} said no (${percent(no, total)}%).`
    : "No answers yet.";
  return {
    ...baseBlock(q, data, totalResponses),
    kind: "YES_NO_DISTRIBUTION",
    yes,
    no,
    yesPercent,
    accessibleSummary,
  };
}
