import type { QuestionDefinition } from "@/lib/forms/definitions";
import type { QuestionAnswerData, TextResponsesBlock } from "../types";
import { baseBlock } from "./base";

const STOPWORDS = new Set(
  `a an the and or but if then else of to in on at by for with from as is are was were be been being am
  i me my we our you your he she it its they them their this that these those there here what which who whom
  how when where why not no yes so very really just also too can could would should will shall may might must
  do does did done have has had having get got make made like about into out up down over under again more most
  some any all each other such than only own same because while during before after above below between
  orizenn feedback thing things something anything nothing lot bit use used using`
    .split(/\s+/)
    .filter(Boolean),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/** Light stemming so "terminologies"/"terminology" and "explanations"/"explanation" group together. */
export function stem(word: string): string {
  const base = word.length > 4 ? word.replace(/ies$/, "y") : word;
  return base
    .replace(/(ations|ation|ings|ing|ness|ments|ment|ers|er|ied|ly|es|s|ed)$/, (m) => (base.length - m.length >= 3 ? "" : m))
    .replace(/(.)\1$/, "$1");
}

export function keywordCounts(texts: readonly string[], limit = 12): Array<{ word: string; count: number }> {
  const counts = new Map<string, { word: string; count: number }>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const w of tokenize(t)) {
      const s = stem(w);
      if (seen.has(s)) continue; // count once per response
      seen.add(s);
      const entry = counts.get(s) ?? { word: w, count: 0 };
      entry.count += 1;
      if (w.length < entry.word.length) entry.word = w; // prefer the shortest surface form
      counts.set(s, entry);
    }
  }
  return Array.from(counts.values())
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** SHORT_TEXT (and LONG_TEXT when configured): response list + keyword summary (PRD §37). */
export function analyzeText(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
  { maxResponses = 200 }: { maxResponses?: number } = {},
): TextResponsesBlock {
  const texts = data?.texts ?? [];
  const responses = texts.slice(0, maxResponses).map((t) => ({
    text: t.text,
    submissionId: t.submissionId,
    quotable: t.consentToQuote === true,
  }));
  const keywords = keywordCounts(texts.map((t) => t.text));
  const accessibleSummary = texts.length
    ? `${texts.length} written answers. Most mentioned words: ${keywords.slice(0, 5).map((k) => k.word).join(", ") || "none repeated"}.`
    : "No written answers yet.";
  return {
    ...baseBlock(q, data, totalResponses),
    kind: "TEXT_RESPONSES",
    responses,
    keywords,
    truncated: texts.length > maxResponses,
    accessibleSummary,
  };
}
