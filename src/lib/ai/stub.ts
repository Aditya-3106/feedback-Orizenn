import { extractThemes } from "@/lib/analytics/question-analyzers/themes";
import type { QuestionType } from "@/lib/forms/definitions";
import { defaultAnalyticsType } from "@/lib/forms/definitions";
import { ASSUMES_OUTCOME_PATTERNS, EMOTIONAL_PATTERNS, JARGON_TERMS, LEADING_PATTERNS } from "./prompts/question-review";
import type {
  AIProvider,
  InsightGenerationInput,
  InsightResult,
  QuestionGenerationInput,
  QuestionReviewInput,
  QuestionReviewResult,
  QuestionSuggestion,
  ThemeExtractionInput,
  ThemeResult,
} from "./types";

interface Template {
  match: RegExp;
  category: string;
  build: (topic: string) => QuestionSuggestion;
}

const usefulness = ["Not useful", "Slightly useful", "Neutral", "Useful", "Very useful"];

function q(
  text: string,
  type: QuestionType,
  category: string,
  extra: Partial<QuestionSuggestion> = {},
): QuestionSuggestion {
  return {
    text,
    type,
    required: type !== "LONG_TEXT",
    category,
    analyticsType: defaultAnalyticsType(type),
    validation: type === "RATING" ? { min: 1, max: 5 } : type === "SCALE" ? { min: 0, max: 10 } : type === "LONG_TEXT" ? { maxLength: 3000 } : {},
    analytics: { displayPriority: 100, showInSummary: type !== "LONG_TEXT" },
    options: [],
    ...extra,
  };
}

const TEMPLATES: Template[] = [
  {
    match: /understand|clear|clarity|confus/i,
    category: "Understanding",
    build: () =>
      q("After using Orizenn, how clearly do you understand your technical strengths?", "SCALE", "Understanding", {
        comparableKey: "strengths_clarity",
        rationale: "Measures the core outcome the goal mentions without assuming it was achieved.",
      }),
  },
  {
    match: /understand|clear|clarity|confus|result/i,
    category: "Friction",
    build: () =>
      q("What, if anything, was confusing or difficult to understand?", "LONG_TEXT", "Friction", {
        required: false,
        comparableKey: "confusion_text",
        rationale: "Open-ended friction question phrased so 'nothing' is a valid answer.",
      }),
  },
  {
    match: /useful|value|helpful|analysis|dashboard/i,
    category: "Value",
    build: () =>
      q("How useful was the Orizenn analysis for your project?", "SINGLE_CHOICE", "Value", {
        options: usefulness.map((label) => ({ label })),
        comparableKey: "analysis_usefulness",
        rationale: "Balanced five-point scale with a neutral midpoint.",
      }),
  },
  {
    match: /discover|reveal|new|learn/i,
    category: "Discovery",
    build: () =>
      q("Did Orizenn show you something about your project that you did not already know?", "SINGLE_CHOICE", "Discovery", {
        options: [{ label: "Yes" }, { label: "No" }, { label: "Not sure" }],
        comparableKey: "revealed_new_info",
      }),
  },
  {
    match: /accura|trust|correct|reliab/i,
    category: "Accuracy",
    build: () =>
      q("How accurate did the results feel compared to your own view of your project?", "RATING", "Accuracy", {
        comparableKey: "perceived_accuracy",
      }),
  },
  {
    match: /improve|change|fix|better|next/i,
    category: "Improvement",
    build: () =>
      q("Which parts of your project did you change after seeing the results?", "MULTIPLE_CHOICE", "Improvement", {
        required: false,
        options: ["Testing", "Validation", "Documentation", "Security", "Code structure", "Nothing yet"].map((label) => ({ label })),
        comparableKey: "changes_made",
      }),
  },
  {
    match: /improve|change|better|useful|next/i,
    category: "Improvement",
    build: () =>
      q("What would make the results more useful to you?", "LONG_TEXT", "Improvement", {
        required: false,
        comparableKey: "improvement_text",
      }),
  },
  {
    match: /again|return|recommend|continue|use/i,
    category: "Return Intent",
    build: () =>
      q("How likely are you to use Orizenn again for a future project?", "SCALE", "Return Intent", {
        comparableKey: "return_intent",
      }),
  },
  {
    match: /onboard|start|setup|first|sign/i,
    category: "Onboarding",
    build: () =>
      q("How easy was it to get started with Orizenn?", "RATING", "Onboarding", {
        comparableKey: "onboarding_ease",
      }),
  },
  {
    match: /easy|usab|navigat|ui|interface/i,
    category: "Usability",
    build: () =>
      q("How easy was it to find what you were looking for in the dashboard?", "RATING", "Usability", {
        comparableKey: "dashboard_ease",
      }),
  },
];

/**
 * Deterministic provider used when AI_PROVIDER=stub. Produces realistic,
 * schema-valid output so the UI, contracts and tests work without a vendor.
 */
export class StubAIProvider implements AIProvider {
  readonly name = "stub";

  async generateQuestions(input: QuestionGenerationInput): Promise<QuestionSuggestion[]> {
    const goal = `${input.goal} ${input.campaignName}`;
    const existing = new Set(input.existingQuestions.map((e) => e.text.toLowerCase()));
    const count = Math.min(Math.max(input.count ?? 6, 3), 8);

    const matched = TEMPLATES.filter((t) => t.match.test(goal));
    const rest = TEMPLATES.filter((t) => !matched.includes(t));
    const ordered = [...matched, ...rest];

    const out: QuestionSuggestion[] = [];
    const seen = new Set<string>();
    for (const t of ordered) {
      const s = t.build(goal);
      const key = s.text.toLowerCase();
      if (seen.has(key) || existing.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= count) break;
    }
    return out;
  }

  async reviewQuestions(input: QuestionReviewInput): Promise<QuestionReviewResult> {
    const issues: QuestionReviewResult["issues"] = [];
    const normalized = new Map<string, number>();
    for (const qn of input.questions) {
      const text = qn.text;
      if (LEADING_PATTERNS.some((p) => p.test(text))) {
        issues.push({
          index: qn.index,
          issue: "LEADING",
          explanation: "The wording suggests the expected answer.",
          suggestion: neutralize(text),
        });
      } else if (ASSUMES_OUTCOME_PATTERNS.some((p) => p.test(text))) {
        issues.push({
          index: qn.index,
          issue: "ASSUMES_OUTCOME",
          explanation: "The question assumes a positive outcome happened.",
          suggestion: neutralize(text),
        });
      }
      if (EMOTIONAL_PATTERNS.some((p) => p.test(text))) {
        issues.push({ index: qn.index, issue: "EMOTIONAL", explanation: "Uses emotionally loaded words." });
      }
      if (/\band\b.*\?/.test(text) && / and (how|what|did|do|was|were) /i.test(text)) {
        issues.push({ index: qn.index, issue: "DOUBLE_BARRELED", explanation: "Asks two things at once. Split into two questions." });
      }
      const jargon = JARGON_TERMS.filter((j) => new RegExp(`\\b${j}\\b`, "i").test(text));
      if (jargon.length) {
        issues.push({ index: qn.index, issue: "JARGON", explanation: `Contains jargon: ${jargon.join(", ")}.` });
      }
      if ((qn.type === "SINGLE_CHOICE" || qn.type === "MULTIPLE_CHOICE" || qn.type === "DROPDOWN") && (qn.options?.length ?? 0) < 2) {
        issues.push({ index: qn.index, issue: "MISSING_OPTIONS", explanation: "Choice questions need at least two options." });
      }
      const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (normalized.has(norm)) {
        issues.push({ index: qn.index, issue: "DUPLICATE", explanation: `Duplicate of question ${normalized.get(norm)}.` });
      } else {
        normalized.set(norm, qn.index);
      }
    }
    return { issues };
  }

  async generateInsights(input: InsightGenerationInput): Promise<InsightResult> {
    const d = input.dashboard;
    const findings: InsightResult["findings"] = [];

    for (const b of d.blocks) {
      if (b.answerCount === 0) continue;
      if ((b.kind === "RATING_DISTRIBUTION" || b.kind === "SCALE_DISTRIBUTION") && b.average != null) {
        const ratio = b.average / b.max;
        findings.push({
          title: b.title,
          description: `${b.answerCount} answers, average ${b.average.toFixed(1)} / ${b.max}. ${b.favourablePercent ?? 0}% chose one of the top two values.`,
          kind: ratio >= 0.7 ? "POSITIVE" : ratio <= 0.5 ? "FRICTION" : "FINDING",
          sourceQuestionIds: [b.questionId],
        });
      } else if (b.kind === "YES_NO_DISTRIBUTION" && b.yesPercent != null) {
        findings.push({
          title: b.title,
          description: `${b.yes} of ${b.answerCount} respondents (${b.yesPercent}%) answered yes.`,
          kind: b.yesPercent >= 60 ? "POSITIVE" : b.yesPercent <= 40 ? "FRICTION" : "FINDING",
          sourceQuestionIds: [b.questionId],
        });
      } else if ((b.kind === "OPTION_DISTRIBUTION" || b.kind === "SEGMENT_DISTRIBUTION") && b.top) {
        findings.push({
          title: b.title,
          description: `${b.top.count} of ${b.answerCount} respondents (${b.top.percent}%) chose “${b.top.label}”.`,
          kind: "FINDING",
          sourceQuestionIds: [b.questionId],
        });
      } else if (b.kind === "MULTI_SELECT_FREQUENCY" && b.items[0]?.count) {
        findings.push({
          title: b.title,
          description: `Most selected: ${b.items
            .filter((i) => i.count > 0)
            .slice(0, 3)
            .map((i) => `“${i.label}” (${i.count}, ${i.percent}%)`)
            .join(", ")}.`,
          kind: "FINDING",
          sourceQuestionIds: [b.questionId],
        });
      } else if (b.kind === "THEME_CLUSTER" && b.themes.length) {
        findings.push({
          title: `Recurring themes in “${b.title}”`,
          description: b.themes
            .slice(0, 4)
            .map((t) => `${t.name}: ${t.count} of ${b.answerCount} written answers`)
            .join("; ") + ".",
          kind: "THEME",
          sourceQuestionIds: [b.questionId],
        });
      }
    }

    for (const c of d.comparisons) {
      const b = d.blocks.find((x) => x.comparison === c);
      if (!b) continue;
      findings.push({
        title: `Change since v${c.previousVersionNumber}: ${b.title}`,
        description: `${c.previous}${c.unit === "percent" ? "%" : ""} → ${c.current}${c.unit === "percent" ? "%" : ""} (${c.delta > 0 ? "+" : ""}${c.delta}).`,
        kind: c.delta > 0 ? "POSITIVE" : c.delta < 0 ? "UNEXPECTED" : "FINDING",
        sourceQuestionIds: [b.questionId],
      });
    }

    const quotes = input.quotableResponses.slice(0, 3).map((r) => ({ questionId: r.questionId, text: r.text }));

    return {
      summary: d.summary.join(" "),
      findings: findings.slice(0, 12),
      representativeQuotes: quotes,
    };
  }

  async extractThemes(input: ThemeExtractionInput): Promise<ThemeResult> {
    const { themes } = extractThemes(
      input.responses.map((r) => ({ ...r, quotable: false })),
      { maxThemes: input.maxThemes ?? 6 },
    );
    return {
      themes: themes.map((t) => ({
        name: t.name,
        keywords: t.keywords,
        submissionIds: t.responses.map((r) => r.submissionId),
      })),
    };
  }
}

function neutralize(text: string): string {
  const cleaned = text
    .replace(/\bdon'?t you (think|agree|feel) (that )?/i, "")
    .replace(/\bisn'?t it\b/i, "")
    .replace(/\bwouldn'?t you (say|agree)\b/i, "")
    .replace(/\b(obviously|clearly)\b/gi, "")
    .replace(/\bhow much (better|easier|more useful|more helpful)\b/i, "how useful")
    .replace(/\bwhat did you (love|enjoy) (most )?about\b/i, "what stood out to you about")
    .replace(/\s{2,}/g, " ")
    .trim();
  const sentence = cleaned.replace(/[?.!]*$/, "");
  const lower = sentence.charAt(0).toLowerCase() + sentence.slice(1);
  return /^how /i.test(sentence) ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}?` : `How would you describe ${lower}?`;
}
