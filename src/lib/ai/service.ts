import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { AppError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { loadDashboard } from "@/lib/analytics/load";
import { MIN_RESPONSES_FOR_INSIGHT } from "@/lib/analytics/metrics";
import type { AnalyticsDashboard } from "@/lib/analytics/types";
import { audit, logEvent } from "@/lib/audit/log";
import { getVersionForActor } from "@/lib/forms/service";
import { toQuestionDefinition } from "@/lib/forms/mapper";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import type { AnalyticsFilters } from "@/lib/validation/filters";
import { getAIProvider } from "./provider";
import {
  insightResultSchema,
  questionReviewResultSchema,
  questionSuggestionsSchema,
  themeResultSchema,
  type InsightResult,
  type QuestionReviewResult,
  type QuestionSuggestion,
} from "./types";

type AIJobType = "QUESTION_GENERATION" | "QUESTION_REVIEW" | "INSIGHT_GENERATION" | "THEME_EXTRACTION";

async function runJob<T>(
  actor: Actor,
  type: AIJobType,
  refs: { campaignId?: string; formVersionId?: string },
  input: unknown,
  fn: () => Promise<T>,
): Promise<{ result: T; jobId: string }> {
  const job = await prisma.aIJob.create({
    data: {
      workspaceId: actor.workspaceId,
      campaignId: refs.campaignId,
      formVersionId: refs.formVersionId,
      type,
      status: "RUNNING",
      inputJson: JSON.parse(JSON.stringify(input ?? null)) as Prisma.InputJsonValue,
    },
  });
  try {
    const result = await fn();
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", outputJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue, completedAt: new Date() },
    });
    return { result, jobId: job.id };
  } catch (err) {
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Unknown error", completedAt: new Date() },
    });
    logEvent("ai.job.failed", { jobId: job.id, type });
    if (err instanceof AppError) throw err;
    throw new AppError("AI_UNAVAILABLE", "AI result couldn't be used. Please try again.", 502);
  }
}

/** PRD §19–§21: generate + review, never insert without admin approval. */
export async function generateQuestionSuggestions(
  actor: Actor,
  versionId: string,
  goal: string,
  count = 6,
): Promise<{ suggestions: QuestionSuggestion[]; review: QuestionReviewResult; jobId: string }> {
  assertPermission(actor.role, "ai:use");
  const version = await getVersionForActor(actor, versionId);
  if (goal.trim().length < 10) {
    throw new ValidationError({ goal: ["Describe what you want to learn in at least 10 characters."] });
  }

  const provider = getAIProvider();
  const input = {
    goal,
    campaignName: version.campaign.name,
    audience: version.campaign.targetAudience ?? undefined,
    existingQuestions: version.questions.map(toQuestionDefinition).map((q) => ({ text: q.text, type: q.type, category: q.category })),
    count,
  };

  const { result, jobId } = await runJob(
    actor,
    "QUESTION_GENERATION",
    { campaignId: version.campaignId, formVersionId: version.id },
    { goal, count },
    async () => {
      const raw = await provider.generateQuestions(input);
      // Contract enforcement (PRD §91, §114): reject anything that doesn't fit the schema.
      const parsed = questionSuggestionsSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError("AI_UNAVAILABLE", "AI result couldn't be used. Please try again.", 502);
      }
      const reviewRaw = await provider.reviewQuestions({
        questions: parsed.data.map((q, index) => ({ index, text: q.text, type: q.type, options: q.options.map((o) => o.label) })),
      });
      const review = questionReviewResultSchema.safeParse(reviewRaw);
      return { suggestions: parsed.data, review: review.success ? review.data : { issues: [] } };
    },
  );

  await audit(prisma, actor, {
    action: "AI_QUESTIONS_GENERATED",
    entityType: "AIJob",
    entityId: jobId,
    metadata: { versionId: version.id, count: result.suggestions.length },
  });

  return { ...result, jobId };
}

/** Insights are generated on demand and persisted as AIInsight rows (PRD §42, §93). */
export async function generateInsights(
  actor: Actor,
  campaignId: string,
  filters: AnalyticsFilters,
): Promise<{ insight: InsightResult; dashboard: AnalyticsDashboard; jobId: string }> {
  assertPermission(actor.role, "ai:use");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);

  const dashboard = await loadDashboard(actor, campaignId, filters);
  if (!dashboard) throw new NotFoundError("Published form");
  if (dashboard.responseCount < MIN_RESPONSES_FOR_INSIGHT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Insights need at least ${MIN_RESPONSES_FOR_INSIGHT} responses. This view has ${dashboard.responseCount}.`,
      400,
    );
  }

  // Only responses whose authors consented (or where consent is not required) may be quoted (PRD §45, §85).
  const quotable = dashboard.themes
    .flatMap((t) => t.responses.map((r) => ({ questionId: t.questionId, text: r.text, quotable: r.quotable })))
    .filter((r) => (campaign.requireQuoteConsent ? r.quotable : true))
    .slice(0, 40)
    .map(({ questionId, text }) => ({ questionId, text }));

  const previous = await prisma.aIInsight.findFirst({
    where: { campaignId, type: "SUMMARY", formVersionId: { not: dashboard.versionId } },
    orderBy: { createdAt: "desc" },
  });

  const provider = getAIProvider();
  const { result, jobId } = await runJob(
    actor,
    "INSIGHT_GENERATION",
    { campaignId, formVersionId: dashboard.versionId },
    { filters, responseCount: dashboard.responseCount },
    async () => {
      const raw = await provider.generateInsights({
        campaign: { name: campaign.name, goal: campaign.goal },
        dashboard,
        quotableResponses: quotable,
        previousSummary: previous?.content,
      });
      const parsed = insightResultSchema.safeParse(raw);
      if (!parsed.success) throw new AppError("AI_UNAVAILABLE", "AI result couldn't be used. Please try again.", 502);
      return crossCheck(parsed.data, dashboard, quotable);
    },
  );

  // Persist for traceability (PRD §63). Replace previous insights for this version.
  await prisma.$transaction(async (tx) => {
    await tx.aIInsight.deleteMany({ where: { campaignId, formVersionId: dashboard.versionId } });
    await tx.aIInsight.create({
      data: {
        campaignId,
        formVersionId: dashboard.versionId,
        type: "SUMMARY",
        title: "Summary",
        content: result.summary,
        sourceQuestionIds: dashboard.blocks.map((b) => b.questionId),
        sourceResponseCount: dashboard.responseCount,
        metadataJson: { filtered: dashboard.filtered, jobId, quotes: result.representativeQuotes } as Prisma.InputJsonValue,
      },
    });
    for (const f of result.findings) {
      await tx.aIInsight.create({
        data: {
          campaignId,
          formVersionId: dashboard.versionId,
          type: "FINDING",
          title: f.title,
          content: f.description,
          sourceQuestionIds: f.sourceQuestionIds,
          sourceResponseCount: dashboard.responseCount,
          metadataJson: { kind: f.kind, jobId } as Prisma.InputJsonValue,
        },
      });
    }
    await audit(tx, actor, {
      action: "AI_INSIGHTS_GENERATED",
      entityType: "AIJob",
      entityId: jobId,
      metadata: { campaignId, versionId: dashboard.versionId, findings: result.findings.length },
    });
  });

  return { insight: result, dashboard, jobId };
}

/**
 * PRD §43, §92: numbers and quotes from the model are cross-checked against
 * deterministic data. Findings citing unknown questions are dropped; quotes
 * that are not verbatim copies of real responses are dropped.
 */
export function crossCheck(
  result: InsightResult,
  dashboard: AnalyticsDashboard,
  quotable: Array<{ questionId: string; text: string }>,
): InsightResult {
  const knownQuestions = new Set(dashboard.blocks.map((b) => b.questionId));
  const knownNumbers = collectNumbers(dashboard);
  const quotableTexts = new Set(quotable.map((q) => q.text.trim()));

  const findings = result.findings
    .filter((f) => f.sourceQuestionIds.every((id) => knownQuestions.has(id)))
    .filter((f) => numbersIn(f.description).every((n) => knownNumbers.has(n)));

  const representativeQuotes = result.representativeQuotes.filter(
    (q) => knownQuestions.has(q.questionId) && quotableTexts.has(q.text.trim()),
  );

  const summaryOk = numbersIn(result.summary).every((n) => knownNumbers.has(n));

  return {
    summary: summaryOk ? result.summary : dashboard.summary.join(" "),
    findings,
    representativeQuotes,
  };
}

function numbersIn(text: string): number[] {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?/g)).map((m) => Number(m[0]));
}

function collectNumbers(d: AnalyticsDashboard): Set<number> {
  const s = new Set<number>([d.responseCount, d.versionNumber, d.questionInsights.length, d.blocks.length]);
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    s.add(n);
    s.add(Math.round(n));
    s.add(Math.round(n * 10) / 10);
    s.add(Math.round(n * 100) / 100);
  };
  for (const c of d.comparisons) [c.previous, c.current, c.delta, Math.abs(c.delta), c.previousVersionNumber].forEach(add);
  for (const b of d.blocks) {
    add(b.answerCount);
    add(b.answerRate);
    switch (b.kind) {
      case "RATING_DISTRIBUTION":
      case "SCALE_DISTRIBUTION":
        [b.average, b.median, b.min, b.max, b.favourablePercent].forEach(add);
        b.distribution.forEach((x) => [x.count, x.percent, Number(x.value)].forEach(add));
        break;
      case "NUMBER_SUMMARY":
        [b.average, b.median, b.min, b.max].forEach(add);
        b.buckets.forEach((x) => [x.count, x.percent].forEach(add));
        break;
      case "OPTION_DISTRIBUTION":
      case "SEGMENT_DISTRIBUTION":
        b.distribution.forEach((x) => [x.count, x.percent].forEach(add));
        break;
      case "MULTI_SELECT_FREQUENCY":
        add(b.averageSelections);
        b.items.forEach((x) => [x.count, x.percent].forEach(add));
        break;
      case "YES_NO_DISTRIBUTION":
        [b.yes, b.no, b.yesPercent, b.yesPercent == null ? null : 100 - b.yesPercent].forEach(add);
        break;
      case "THEME_CLUSTER":
        add(b.themes.length);
        add(b.uncategorised);
        b.themes.forEach((t) => [t.count, t.percent].forEach(add));
        break;
      case "TEXT_RESPONSES":
        b.keywords.forEach((k) => add(k.count));
        break;
    }
  }
  return s;
}

export async function extractThemesForQuestion(actor: Actor, campaignId: string, questionId: string, filters: AnalyticsFilters) {
  assertPermission(actor.role, "ai:use");
  const dashboard = await loadDashboard(actor, campaignId, filters);
  if (!dashboard) throw new NotFoundError("Published form");
  const block = dashboard.themes.find((t) => t.questionId === questionId);
  if (!block) throw new NotFoundError("Text question");

  const provider = getAIProvider();
  const { result, jobId } = await runJob(actor, "THEME_EXTRACTION", { campaignId, formVersionId: dashboard.versionId }, { questionId }, async () => {
    const raw = await provider.extractThemes({
      question: { id: questionId, text: block.title },
      responses: block.responses.map((r) => ({ submissionId: r.submissionId, text: r.text })),
    });
    const parsed = themeResultSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("AI_UNAVAILABLE", "AI result couldn't be used. Please try again.", 502);
    // Drop any submission id the model invented.
    const known = new Set(block.responses.map((r) => r.submissionId));
    return {
      themes: parsed.data.themes
        .map((t) => ({ ...t, submissionIds: t.submissionIds.filter((id) => known.has(id)) }))
        .filter((t) => t.submissionIds.length > 0),
    };
  });
  return { themes: result.themes, jobId };
}

export async function getStoredInsights(actor: Actor, campaignId: string, versionId: string) {
  assertPermission(actor.role, "analytics:view");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { workspaceId: true } });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);
  return prisma.aIInsight.findMany({
    where: { campaignId, formVersionId: versionId },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
}
