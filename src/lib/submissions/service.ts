import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { AppError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { logEvent } from "@/lib/audit/log";
import { getPublicForm } from "@/lib/forms/service";
import { type AnswerValue, type QuestionDefinition } from "@/lib/forms/definitions";
import { toQuestionDefinition, questionInclude } from "@/lib/forms/mapper";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import { checkRateLimit } from "@/lib/security/rate-limit";
import type { AnalyticsFilters } from "@/lib/validation/filters";
import {
  submissionPayloadSchema,
  validateAnswers,
  validateRespondentContext,
  type SubmissionPayload,
} from "@/lib/validation/submission";
import { presentRespondent, sanitizeRespondentInput, type PresentedRespondent } from "./privacy";
import { submissionWhere } from "./where";

// ───────────────────────── Public submission ─────────────────────────

export interface SubmitInput {
  slug: string;
  payload: unknown;
  /** Hashed request identifier for throttling; never a raw IP. */
  requestHash: string;
}

export interface SubmitResult {
  submissionId: string;
  duplicate: boolean;
}

function answerData(value: AnswerValue): Pick<Prisma.AnswerCreateManyInput, "textValue" | "numberValue" | "booleanValue" | "jsonValue"> {
  switch (value.kind) {
    case "number":
      return { numberValue: value.value };
    case "text":
      return { textValue: value.value };
    case "boolean":
      return { booleanValue: value.value };
    case "json":
      return { jsonValue: value.value };
  }
}

/**
 * Accept a public submission (PRD §28, §78–§83). All checks are server-side:
 * the form definition is loaded from the database, never trusted from the client.
 */
export async function submitResponse(input: SubmitInput): Promise<SubmitResult> {
  // 1. Throttle per request fingerprint (10 submissions / 10 minutes).
  const rl = checkRateLimit(`submit:${input.requestHash}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!rl.allowed) {
    throw new AppError("RATE_LIMITED", "Too many submissions. Please try again in a few minutes.", 429);
  }

  // 2. Parse the envelope.
  const parsed = submissionPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fields[issue.path.map(String).join(".") || "_form"] ??= []).push(issue.message);
    }
    throw new ValidationError(fields);
  }
  const payload: SubmissionPayload = parsed.data;

  // Honeypot: silently accept but do not store (bots get a "success").
  if (payload.website && payload.website.length > 0) {
    logEvent("form.submission.honeypot", { slug: input.slug });
    return { submissionId: "ignored", duplicate: false };
  }

  // 3. Idempotency: same client token → same submission.
  const existing = await prisma.submission.findUnique({
    where: { clientToken: payload.clientToken },
    select: { id: true },
  });
  if (existing) return { submissionId: existing.id, duplicate: true };

  // 4. Resolve the form and all gating rules.
  const { form } = await getPublicForm(input.slug);

  // 5. Validate respondent context + answers against the DB definition.
  const respondentErrors = validateRespondentContext(form, payload.respondent);
  const answerResult = validateAnswers(form, payload.answers);
  const errors = { ...respondentErrors, ...answerResult.errors };
  if (form.campaign.requireQuoteConsent && typeof payload.consentToQuote !== "boolean") {
    errors.consentToQuote = ["Please tell us whether we may quote your feedback."];
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const respondentInput = sanitizeRespondentInput(form.campaign.responseMode, {
    ...payload.respondent,
    email: payload.respondent.email?.toLowerCase() || undefined,
  });
  const collectsContext = form.campaign.responseMode !== "ANONYMOUS" || form.campaign.respondentFields.length > 0;

  const requiredCount = form.questions.filter((q) => q.required).length;
  const answeredCount = answerResult.answers.length;
  const completionPercent = form.questions.length
    ? Math.round((answeredCount / form.questions.length) * 100)
    : 100;
  const startedAt = payload.startedAt ? new Date(payload.startedAt) : null;
  const now = new Date();
  const durationSeconds = startedAt ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000)) : null;

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: form.campaign.id },
      select: { workspaceId: true, maxResponses: true },
    });
    if (!campaign) throw new NotFoundError("Campaign");

    // Response limit re-checked inside the transaction.
    if (campaign.maxResponses != null) {
      const count = await tx.submission.count({ where: { campaignId: form.campaign.id, status: "COMPLETED" } });
      if (count >= campaign.maxResponses) {
        throw new AppError("RESPONSE_LIMIT_REACHED", "This feedback form has reached its response limit.", 410);
      }
    }

    // Respondent handling.
    let respondentId: string | null = null;
    if (collectsContext) {
      const email = respondentInput.email;
      if (email && form.campaign.responseMode !== "ANONYMOUS") {
        const found = await tx.respondent.findFirst({ where: { workspaceId: campaign.workspaceId, email } });
        if (found) {
          if (!form.campaign.allowMultipleResponses) {
            const prior = await tx.submission.findFirst({
              where: { campaignId: form.campaign.id, respondentId: found.id, status: "COMPLETED" },
              select: { id: true },
            });
            if (prior) {
              throw new AppError("DUPLICATE_SUBMISSION", "A response has already been recorded for this email.", 409);
            }
          }
          const updated = await tx.respondent.update({
            where: { id: found.id },
            data: {
              name: respondentInput.name ?? found.name,
              college: respondentInput.college ?? found.college,
              branch: respondentInput.branch ?? found.branch,
              year: respondentInput.year ?? found.year,
              projectType: respondentInput.projectType ?? found.projectType,
            },
          });
          respondentId = updated.id;
        }
      }
      if (!respondentId) {
        const created = await tx.respondent.create({
          data: {
            workspaceId: campaign.workspaceId,
            name: respondentInput.name,
            email: respondentInput.email,
            college: respondentInput.college,
            branch: respondentInput.branch,
            year: respondentInput.year,
            projectType: respondentInput.projectType,
          },
        });
        respondentId = created.id;
      }
    }

    const submission = await tx.submission.create({
      data: {
        campaignId: form.campaign.id,
        formVersionId: form.versionId,
        respondentId,
        clientToken: payload.clientToken,
        requestHash: input.requestHash,
        status: "COMPLETED",
        startedAt,
        submittedAt: now,
        completionPercent,
        durationSeconds,
        consentToQuote: payload.consentToQuote ?? null,
        metadataJson: { requiredCount, answeredCount },
      },
    });

    if (answerResult.answers.length) {
      await tx.answer.createMany({
        data: answerResult.answers.map((a) => ({
          submissionId: submission.id,
          questionId: a.questionId,
          ...answerData(a.value),
        })),
      });
    }

    logEvent("form.submission.created", {
      campaignId: form.campaign.id,
      versionId: form.versionId,
      submissionId: submission.id,
      answers: answerResult.answers.length,
    });

    return { submissionId: submission.id, duplicate: false };
  });
}

// ───────────────────────── Admin reads ─────────────────────────

export interface SubmissionListOptions {
  filters: AnalyticsFilters;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface SubmissionListRow {
  id: string;
  submittedAt: Date | null;
  status: string;
  usageVerificationStatus: string;
  completionPercent: number;
  durationSeconds: number | null;
  versionNumber: number;
  respondent: PresentedRespondent;
}

export async function listSubmissions(actor: Actor, campaignId: string, opts: SubmissionListOptions) {
  assertPermission(actor.role, "responses:view");
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { workspaceId: true, responseMode: true },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);

  const where = submissionWhere(campaignId, opts.filters.versionId, opts.filters);
  if (opts.q && campaign.responseMode !== "ANONYMOUS") {
    const q = opts.q;
    const respondentSearch: Prisma.RespondentWhereInput = {
      OR: [
        { college: { contains: q, mode: "insensitive" } },
        { branch: { contains: q, mode: "insensitive" } },
        { year: { contains: q, mode: "insensitive" } },
        ...(campaign.responseMode === "IDENTIFIED"
          ? [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ]
          : []),
      ],
    };
    where.respondent = where.respondent ? { AND: [where.respondent, respondentSearch] } : respondentSearch;
  }

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 25));

  const [total, rows] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { respondent: true, formVersion: { select: { versionNumber: true } } },
    }),
  ]);

  const items: SubmissionListRow[] = rows.map((s, i) => ({
    id: s.id,
    submittedAt: s.submittedAt,
    status: s.status,
    usageVerificationStatus: s.usageVerificationStatus,
    completionPercent: s.completionPercent,
    durationSeconds: s.durationSeconds,
    versionNumber: s.formVersion.versionNumber,
    respondent: presentRespondent(campaign.responseMode, s.respondent, (page - 1) * pageSize + i),
  }));

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface SubmissionDetail {
  id: string;
  submittedAt: Date | null;
  status: string;
  usageVerificationStatus: string;
  consentToQuote: boolean | null;
  durationSeconds: number | null;
  versionNumber: number;
  campaignId: string;
  respondent: PresentedRespondent;
  answers: Array<{ question: QuestionDefinition; value: AnswerValue | null }>;
}

export async function getSubmissionDetail(actor: Actor, submissionId: string): Promise<SubmissionDetail> {
  assertPermission(actor.role, "responses:view");
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      campaign: { select: { workspaceId: true, responseMode: true } },
      respondent: true,
      formVersion: {
        select: { versionNumber: true, questions: { include: questionInclude, orderBy: { position: "asc" } } },
      },
      answers: true,
    },
  });
  if (!s) throw new NotFoundError("Response");
  assertSameWorkspace(actor, s.campaign.workspaceId);

  const byQuestion = new Map(s.answers.map((a) => [a.questionId, a]));
  const answers = s.formVersion.questions.map((row) => {
    const q = toQuestionDefinition(row);
    const a = byQuestion.get(q.id);
    let value: AnswerValue | null = null;
    if (a) {
      if (a.numberValue != null) value = { kind: "number", value: a.numberValue };
      else if (a.booleanValue != null) value = { kind: "boolean", value: a.booleanValue };
      else if (a.textValue != null) value = { kind: "text", value: a.textValue };
      else if (Array.isArray(a.jsonValue)) value = { kind: "json", value: a.jsonValue.map(String) };
    }
    return { question: q, value };
  });

  return {
    id: s.id,
    submittedAt: s.submittedAt,
    status: s.status,
    usageVerificationStatus: s.usageVerificationStatus,
    consentToQuote: s.consentToQuote,
    durationSeconds: s.durationSeconds,
    versionNumber: s.formVersion.versionNumber,
    campaignId: s.campaignId,
    respondent: presentRespondent(s.campaign.responseMode, s.respondent),
    answers,
  };
}

/** Distinct segment values for filter dropdowns. */
export async function getSegmentOptions(actor: Actor, campaignId: string) {
  assertPermission(actor.role, "responses:view");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { workspaceId: true } });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);

  const rows = await prisma.respondent.findMany({
    where: { submissions: { some: { campaignId } } },
    select: { college: true, branch: true, year: true, projectType: true },
    distinct: ["college", "branch", "year", "projectType"],
    take: 500,
  });
  const collect = (k: "college" | "branch" | "year" | "projectType") =>
    Array.from(new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))).sort();
  return {
    college: collect("college"),
    branch: collect("branch"),
    year: collect("year"),
    projectType: collect("projectType"),
  };
}

/** Respondents across the workspace (PRD /admin/students). */
export async function listRespondents(actor: Actor, q?: string) {
  assertPermission(actor.role, "students:view");
  const where: Prisma.RespondentWhereInput = { workspaceId: actor.workspaceId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { college: { contains: q, mode: "insensitive" } },
      { branch: { contains: q, mode: "insensitive" } },
      { year: { contains: q, mode: "insensitive" } },
    ];
  }
  return prisma.respondent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { submissions: true } },
      submissions: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { submittedAt: true, usageVerificationStatus: true, campaign: { select: { responseMode: true, name: true } } },
      },
    },
  });
}
