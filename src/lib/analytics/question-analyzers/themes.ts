import type { QuestionDefinition } from "@/lib/forms/definitions";
import { percent } from "../metrics";
import type { QuestionAnswerData, Theme, ThemeClusterBlock } from "../types";
import { baseBlock } from "./base";
import { stem, tokenize } from "./text";

interface TextItem {
  text: string;
  submissionId: string;
  quotable: boolean;
}

/**
 * Deterministic keyword-based theme extraction. Each theme is anchored on a
 * frequently co-occurring stem and lists the actual responses that mention it.
 * Responses may belong to more than one theme. This is the fallback when no AI
 * provider is configured and the baseline AI output is cross-checked against.
 */
export function extractThemes(items: readonly TextItem[], { maxThemes = 6, minMentions = 2 } = {}): {
  themes: Theme[];
  uncategorised: number;
} {
  if (!items.length) return { themes: [], uncategorised: 0 };

  const docs = items.map((item) => {
    const stems = new Map<string, string>();
    for (const w of tokenize(item.text)) {
      const s = stem(w);
      if (!stems.has(s) || w.length < (stems.get(s) as string).length) stems.set(s, w);
    }
    return { item, stems };
  });

  // Document frequency per stem.
  const df = new Map<string, { count: number; surface: string }>();
  for (const d of docs) {
    for (const [s, surface] of d.stems) {
      const e = df.get(s) ?? { count: 0, surface };
      e.count += 1;
      if (surface.length < e.surface.length) e.surface = surface;
      df.set(s, e);
    }
  }

  const candidates = Array.from(df.entries())
    .filter(([, e]) => e.count >= Math.max(minMentions, Math.ceil(docs.length * 0.05)))
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

  const themes: Theme[] = [];
  const covered = new Set<number>();
  const usedStems = new Set<string>();

  for (const [anchor, info] of candidates) {
    if (themes.length >= maxThemes) break;
    if (usedStems.has(anchor)) continue;

    const memberIdx = docs.map((d, i) => (d.stems.has(anchor) ? i : -1)).filter((i) => i >= 0);
    // Skip near-duplicate themes (≥70% overlap with an existing theme).
    const dup = themes.some((t) => {
      const ids = new Set(t.responses.map((r) => r.submissionId));
      const overlap = memberIdx.filter((i) => ids.has(docs[i].item.submissionId)).length;
      return overlap / memberIdx.length >= 0.7;
    });
    if (dup) {
      usedStems.add(anchor);
      continue;
    }

    // Co-occurring stems that describe the theme.
    const co = new Map<string, number>();
    for (const i of memberIdx) {
      for (const s of docs[i].stems.keys()) {
        if (s !== anchor) co.set(s, (co.get(s) ?? 0) + 1);
      }
    }
    const related = Array.from(co.entries())
      .filter(([, c]) => c >= Math.max(2, Math.ceil(memberIdx.length * 0.3)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s]) => df.get(s)?.surface ?? s);

    for (const s of related) usedStems.add(stem(s));
    usedStems.add(anchor);
    memberIdx.forEach((i) => covered.add(i));

    const keywords = [info.surface, ...related];
    themes.push({
      id: `theme:${anchor}`,
      name: titleFor(keywords),
      count: memberIdx.length,
      percent: percent(memberIdx.length, docs.length),
      keywords,
      responses: memberIdx.map((i) => docs[i].item),
    });
  }

  return { themes, uncategorised: docs.length - covered.size };
}

function titleFor(keywords: string[]): string {
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return keywords.slice(0, 2).map(cap).join(" · ");
}

/** LONG_TEXT: themes + recurring topics (PRD §37, §44). */
export function analyzeThemes(
  q: QuestionDefinition,
  data: QuestionAnswerData | undefined,
  totalResponses: number,
  { maxResponses = 200 }: { maxResponses?: number } = {},
): ThemeClusterBlock {
  const items: TextItem[] = (data?.texts ?? []).map((t) => ({
    text: t.text,
    submissionId: t.submissionId,
    quotable: t.consentToQuote === true,
  }));
  const { themes, uncategorised } = extractThemes(items);
  const accessibleSummary = items.length
    ? themes.length
      ? `${items.length} written answers grouped into ${themes.length} themes: ${themes
          .map((t) => `${t.name} (${t.count} mentions)`)
          .join(", ")}.`
      : `${items.length} written answers; no recurring theme yet.`
    : "No written answers yet.";

  return {
    ...baseBlock(q, data, totalResponses),
    kind: "THEME_CLUSTER",
    themes,
    source: "deterministic",
    uncategorised,
    responses: items.slice(0, maxResponses),
    accessibleSummary,
  };
}
