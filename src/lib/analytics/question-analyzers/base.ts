import type { QuestionDefinition } from "@/lib/forms/definitions";
import { percent } from "../metrics";
import type { QuestionAnswerData } from "../types";

/** Fields shared by every question block. */
export function baseBlock(q: QuestionDefinition, data: QuestionAnswerData | undefined, totalResponses: number) {
  const answerCount = data?.answerCount ?? 0;
  return {
    id: `q:${q.id}`,
    questionId: q.id,
    questionKey: q.key,
    title: q.text,
    category: q.category,
    displayPriority: q.analytics.displayPriority,
    showInSummary: q.analytics.showInSummary,
    answerCount,
    answerRate: percent(answerCount, totalResponses),
  };
}

export function optionLabel(q: QuestionDefinition, value: string): string {
  return q.options.find((o) => o.value === value)?.label ?? value;
}
