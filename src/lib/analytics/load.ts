import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/api/errors";
import type { QuestionDefinition } from "@/lib/forms/definitions";
import { formVersionInclude, toFormDefinition, toQuestionDefinition, questionInclude } from "@/lib/forms/mapper";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import { submissionWhere } from "@/lib/submissions/where";
import { RESPONDENT_FIELD_LABELS, type RespondentField } from "@/lib/forms/definitions";
import { hasActiveFilters, type AnalyticsFilters } from "@/lib/validation/filters";
import { buildDashboard } from "./engine";
import type { AnalyticsDashboard, AnalyticsInput, PreviousVersionData, QuestionAnswerData, SegmentData, TimelinePoint, TotalsData } from "./types";

const TEXT_SAMPLE_LIMIT = 2000;

/**
 * Load everything the engine needs, using Prisma aggregation for the heavy
 * parts (PRD §93, §95). Returns null when the campaign has no published or
 * selected version yet.
 */
export async function loadAnalyticsInput(
  actor: Actor,
  campaignId: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsInput | null> {
  assertPermission(actor.role, "analytics:view");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, goal: true, responseMode: true, status: true, workspaceId: true },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);

  const version = filters.versionId
    ? await prisma.formVersion.findFirst({ where: { id: filters.versionId, campaignId }, include: formVersionInclude })
    : (await prisma.formVersion.findFirst({ where: { campaignId, status: "PUBLISHED" }, include: formVersionInclude })) ??
      (await prisma.formVersion.findFirst({
        where: { campaignId, submissions: { some: {} } },
        orderBy: { versionNumber: "desc" },
        include: formVersionInclude,
      }));
  if (!version) return null;

  const definition = toFormDefinition(version);
  const where = submissionWhere(campaignId, version.id, filters);

  const [totals, timeline, answers, segments, previous] = await Promise.all([
    loadTotals(campaignId, version.id, where),
    loadTimeline(where),
    loadAnswers(definition.questions, where),
    filters.segmentBy ? loadSegments(definition.questions, where, filters.segmentBy) : Promise.resolve(undefined),
    loadPrevious(campaignId, version.versionNumber, definition.questions),
  ]);

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      responseMode: campaign.responseMode,
      status: campaign.status,
    },
    version: { id: version.id, versionNumber: version.versionNumber, publishedAt: version.publishedAt },
    questions: definition.questions,
    totals,
    timeline,
    answers,
    segments,
    previous,
    filters,
    filtered: hasActiveFilters(filters),
  };
}

export async function loadDashboard(actor: Actor, campaignId: string, filters: AnalyticsFilters): Promise<AnalyticsDashboard | null> {
  const input = await loadAnalyticsInput(actor, campaignId, filters);
  return input ? buildDashboard(input) : null;
}

async function loadTotals(campaignId: string, versionId: string, where: Prisma.SubmissionWhereInput): Promise<TotalsData> {
  // Status-independent copy of the filter for start/abandon counts.
  const { status: _ignored, ...base } = where;
  void _ignored;
  const [byStatus, agg] = await Promise.all([
    prisma.submission.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.submission.aggregate({ where, _avg: { durationSeconds: true, completionPercent: true }, _count: { _all: true } }),
  ]);
  const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  return {
    totalSubmissions: byStatus.reduce((s, r) => s + r._count._all, 0),
    completedSubmissions: agg._count._all,
    startedCount: count("IN_PROGRESS"),
    abandonedCount: count("ABANDONED"),
    invalidCount: count("INVALID"),
    avgDurationSeconds: agg._avg.durationSeconds,
    avgCompletionPercent: agg._avg.completionPercent,
  };
}

async function loadTimeline(where: Prisma.SubmissionWhereInput): Promise<TimelinePoint[]> {
  const rows = await prisma.submission.findMany({ where, select: { submittedAt: true }, take: 50_000 });
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (!r.submittedAt) continue;
    const day = r.submittedAt.toISOString().slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

async function loadAnswers(
  questions: QuestionDefinition[],
  where: Prisma.SubmissionWhereInput,
): Promise<Record<string, QuestionAnswerData>> {
  const ids = (pred: (q: QuestionDefinition) => boolean) => questions.filter(pred).map((q) => q.id);
  const numericIds = ids((q) => q.type === "RATING" || q.type === "SCALE" || q.type === "NUMBER");
  const boolIds = ids((q) => q.type === "YES_NO");
  const choiceIds = ids((q) => q.type === "SINGLE_CHOICE" || q.type === "DROPDOWN");
  const multiIds = ids((q) => q.type === "MULTIPLE_CHOICE");
  const textIds = ids((q) => q.type === "SHORT_TEXT" || q.type === "LONG_TEXT");

  const answerWhere = (questionIds: string[]): Prisma.AnswerWhereInput => ({
    questionId: { in: questionIds },
    submission: where,
  });

  const [counts, numeric, bools, choices, multis, texts] = await Promise.all([
    prisma.answer.groupBy({ by: ["questionId"], where: answerWhere(questions.map((q) => q.id)), _count: { _all: true } }),
    numericIds.length
      ? prisma.answer.groupBy({ by: ["questionId", "numberValue"], where: { ...answerWhere(numericIds), numberValue: { not: null } }, _count: { _all: true } })
      : Promise.resolve([]),
    boolIds.length
      ? prisma.answer.groupBy({ by: ["questionId", "booleanValue"], where: { ...answerWhere(boolIds), booleanValue: { not: null } }, _count: { _all: true } })
      : Promise.resolve([]),
    choiceIds.length
      ? prisma.answer.groupBy({ by: ["questionId", "textValue"], where: { ...answerWhere(choiceIds), textValue: { not: null } }, _count: { _all: true } })
      : Promise.resolve([]),
    multiIds.length
      ? prisma.answer.findMany({ where: answerWhere(multiIds), select: { questionId: true, jsonValue: true }, take: 50_000 })
      : Promise.resolve([]),
    textIds.length
      ? prisma.answer.findMany({
          where: { ...answerWhere(textIds), textValue: { not: null } },
          select: {
            questionId: true,
            textValue: true,
            submissionId: true,
            submission: { select: { submittedAt: true, consentToQuote: true } },
          },
          orderBy: { submission: { submittedAt: "desc" } },
          take: TEXT_SAMPLE_LIMIT * Math.max(1, textIds.length),
        })
      : Promise.resolve([]),
  ]);

  const result: Record<string, QuestionAnswerData> = {};
  const ensure = (id: string) => (result[id] ??= { questionId: id, answerCount: 0 });

  for (const c of counts) ensure(c.questionId).answerCount = c._count._all;
  for (const n of numeric) {
    if (n.numberValue == null) continue;
    (ensure(n.questionId).numberCounts ??= []).push({ value: n.numberValue, count: n._count._all });
  }
  for (const b of bools) {
    const d = ensure(b.questionId);
    d.booleanCounts ??= { yes: 0, no: 0 };
    if (b.booleanValue === true) d.booleanCounts.yes += b._count._all;
    else if (b.booleanValue === false) d.booleanCounts.no += b._count._all;
  }
  for (const c of choices) {
    if (c.textValue == null) continue;
    (ensure(c.questionId).textCounts ??= []).push({ value: c.textValue, count: c._count._all });
  }
  for (const m of multis) {
    if (!Array.isArray(m.jsonValue)) continue;
    (ensure(m.questionId).jsonValues ??= []).push(m.jsonValue.map(String));
  }
  for (const t of texts) {
    if (!t.textValue) continue;
    const d = ensure(t.questionId);
    d.texts ??= [];
    if (d.texts.length >= TEXT_SAMPLE_LIMIT) continue;
    d.texts.push({
      text: t.textValue,
      submissionId: t.submissionId,
      submittedAt: t.submission.submittedAt,
      consentToQuote: t.submission.consentToQuote,
    });
  }
  return result;
}

const SEGMENT_FIELDS: RespondentField[] = ["college", "branch", "year", "projectType"];

async function loadSegments(
  questions: QuestionDefinition[],
  where: Prisma.SubmissionWhereInput,
  segmentBy: string,
): Promise<SegmentData | undefined> {
  const metricQuestions = questions.filter((q) => ["RATING", "SCALE", "NUMBER", "YES_NO"].includes(q.type));
  if (!metricQuestions.length) return undefined;

  // Determine the segment label for each submission.
  let labelOf: Map<string, string>;
  let by: string;
  if ((SEGMENT_FIELDS as string[]).includes(segmentBy)) {
    const field = segmentBy as RespondentField;
    by = RESPONDENT_FIELD_LABELS[field];
    const subs = await prisma.submission.findMany({
      where,
      select: { id: true, respondent: { select: { college: true, branch: true, year: true, projectType: true } } },
      take: 50_000,
    });
    labelOf = new Map();
    for (const s of subs) {
      const v = s.respondent?.[field as "college" | "branch" | "year" | "projectType"];
      if (v) labelOf.set(s.id, v);
    }
  } else {
    const segQ = questions.find((q) => q.id === segmentBy && (q.type === "SINGLE_CHOICE" || q.type === "DROPDOWN" || q.type === "YES_NO"));
    if (!segQ) return undefined;
    by = segQ.text;
    const rows = await prisma.answer.findMany({
      where: { questionId: segQ.id, submission: where },
      select: { submissionId: true, textValue: true, booleanValue: true },
      take: 50_000,
    });
    labelOf = new Map();
    for (const r of rows) {
      const raw = r.textValue ?? (r.booleanValue == null ? null : r.booleanValue ? "Yes" : "No");
      if (raw == null) continue;
      labelOf.set(r.submissionId, segQ.options.find((o) => o.value === raw)?.label ?? raw);
    }
  }
  if (!labelOf.size) return undefined;

  const answers = await prisma.answer.findMany({
    where: { questionId: { in: metricQuestions.map((q) => q.id) }, submissionId: { in: Array.from(labelOf.keys()) } },
    select: { questionId: true, submissionId: true, numberValue: true, booleanValue: true },
    take: 200_000,
  });

  const groups = new Map<string, { submissions: Set<string>; sums: Map<string, { sum: number; count: number }> }>();
  for (const a of answers) {
    const label = labelOf.get(a.submissionId);
    if (!label) continue;
    const g = groups.get(label) ?? { submissions: new Set(), sums: new Map() };
    g.submissions.add(a.submissionId);
    const value = a.numberValue ?? (a.booleanValue == null ? null : a.booleanValue ? 1 : 0);
    if (value != null) {
      const s = g.sums.get(a.questionId) ?? { sum: 0, count: 0 };
      s.sum += value;
      s.count += 1;
      g.sums.set(a.questionId, s);
    }
    groups.set(label, g);
  }

  return {
    by,
    byKey: segmentBy,
    groups: Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, g]) => ({
        label,
        submissionCount: g.submissions.size,
        metrics: Object.fromEntries(
          Array.from(g.sums.entries()).map(([qid, s]) => [qid, { average: s.count ? s.sum / s.count : 0, count: s.count }]),
        ),
      })),
  };
}

/** Previous version metrics for comparable keys (PRD §39, §131). */
async function loadPrevious(
  campaignId: string,
  currentVersionNumber: number,
  questions: QuestionDefinition[],
): Promise<PreviousVersionData | undefined> {
  const keys = questions.filter((q) => q.comparableKey).map((q) => q.comparableKey as string);
  if (!keys.length) return undefined;

  const prev = await prisma.formVersion.findFirst({
    where: { campaignId, versionNumber: { lt: currentVersionNumber }, submissions: { some: { status: "COMPLETED" } } },
    orderBy: { versionNumber: "desc" },
    include: { questions: { where: { comparableKey: { in: keys } }, include: questionInclude } },
  });
  if (!prev || !prev.questions.length) return undefined;

  const where: Prisma.SubmissionWhereInput = { formVersionId: prev.id, status: "COMPLETED" };
  const [responseCount, agg, bools] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.answer.groupBy({
      by: ["questionId"],
      where: { questionId: { in: prev.questions.map((q) => q.id) }, numberValue: { not: null }, submission: where },
      _avg: { numberValue: true },
      _count: { _all: true },
    }),
    prisma.answer.groupBy({
      by: ["questionId", "booleanValue"],
      where: { questionId: { in: prev.questions.map((q) => q.id) }, booleanValue: { not: null }, submission: where },
      _count: { _all: true },
    }),
  ]);

  const comparable: PreviousVersionData["comparable"] = {};
  for (const row of prev.questions) {
    const q = toQuestionDefinition(row);
    if (!q.comparableKey) continue;
    const current = questions.find((c) => c.comparableKey === q.comparableKey);
    if (!current || current.type !== q.type) continue; // type mismatch → not comparable
    const numeric = agg.find((a) => a.questionId === q.id);
    if (numeric && numeric._avg.numberValue != null) {
      comparable[q.comparableKey] = { average: numeric._avg.numberValue, count: numeric._count._all, questionText: q.text };
      continue;
    }
    const yes = bools.find((b) => b.questionId === q.id && b.booleanValue === true)?._count._all ?? 0;
    const no = bools.find((b) => b.questionId === q.id && b.booleanValue === false)?._count._all ?? 0;
    if (yes + no > 0) comparable[q.comparableKey] = { average: yes / (yes + no), count: yes + no, questionText: q.text };
  }

  return Object.keys(comparable).length ? { versionNumber: prev.versionNumber, responseCount, comparable } : undefined;
}
