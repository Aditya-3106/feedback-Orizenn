import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { audit } from "@/lib/audit/log";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import { generateLinkSlug } from "@/lib/utils/slug";
import { questionDraftSchema } from "@/lib/validation/question";
import { cloneQuestionsData, questionDraftToCreateData } from "./clone";
import { estimateMinutes, type FormDefinition } from "./definitions";
import { formVersionInclude, toFormDefinition, toQuestionDefinition, type FormVersionRow } from "./mapper";
import { checkPublishable } from "./publish-check";

// ───────────────────────── Reads ─────────────────────────

/** Load a version with its campaign, enforcing workspace ownership. */
export async function getVersionForActor(actor: Actor, versionId: string): Promise<FormVersionRow> {
  assertPermission(actor.role, "campaign:view");
  const version = await prisma.formVersion.findUnique({
    where: { id: versionId },
    include: formVersionInclude,
  });
  if (!version) throw new NotFoundError("Form version");
  assertSameWorkspace(actor, version.campaign.workspaceId);
  return version;
}

export async function getVersionDefinition(actor: Actor, versionId: string): Promise<FormDefinition> {
  return toFormDefinition(await getVersionForActor(actor, versionId));
}

export async function listVersions(actor: Actor, campaignId: string) {
  assertPermission(actor.role, "campaign:view");
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { workspaceId: true },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);
  return prisma.formVersion.findMany({
    where: { campaignId },
    orderBy: { versionNumber: "desc" },
    include: {
      _count: { select: { questions: true, submissions: { where: { status: "COMPLETED" } } } },
      links: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

/** The single editable draft for a campaign, if any. */
export async function getDraftVersion(actor: Actor, campaignId: string): Promise<FormVersionRow | null> {
  assertPermission(actor.role, "campaign:view");
  const draft = await prisma.formVersion.findFirst({
    where: { campaignId, status: "DRAFT" },
    orderBy: { versionNumber: "desc" },
    include: formVersionInclude,
  });
  if (!draft) return null;
  assertSameWorkspace(actor, draft.campaign.workspaceId);
  return draft;
}

export async function getPublishedVersion(actor: Actor, campaignId: string): Promise<FormVersionRow | null> {
  assertPermission(actor.role, "campaign:view");
  const v = await prisma.formVersion.findFirst({
    where: { campaignId, status: "PUBLISHED" },
    include: formVersionInclude,
  });
  if (!v) return null;
  assertSameWorkspace(actor, v.campaign.workspaceId);
  return v;
}

/**
 * Previous forms available for reuse (PRD §14): every version in the workspace
 * that has at least one question, newest first.
 */
export async function listReusableForms(actor: Actor, excludeCampaignId?: string) {
  assertPermission(actor.role, "campaign:view");
  return prisma.formVersion.findMany({
    where: {
      campaign: { workspaceId: actor.workspaceId },
      questions: { some: {} },
      ...(excludeCampaignId ? { campaignId: { not: excludeCampaignId } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      campaign: { select: { id: true, name: true } },
      _count: { select: { questions: true, submissions: { where: { status: "COMPLETED" } } } },
    },
  });
}

// ───────────────────────── Draft creation ─────────────────────────

export type DraftSource =
  | { kind: "blank" }
  | { kind: "version"; versionId: string }
  | { kind: "template"; templateId: string };

/**
 * Create a new draft version for a campaign. Only one draft exists at a time.
 * Cloning never touches the source version (PRD §14, §52).
 */
export async function createDraftVersion(actor: Actor, campaignId: string, source: DraftSource) {
  assertPermission(actor.role, "form:edit");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { versions: { select: { id: true, versionNumber: true, status: true } } },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);

  const existingDraft = campaign.versions.find((v) => v.status === "DRAFT");
  if (existingDraft) {
    throw new ConflictError("This campaign already has a draft version. Edit or publish it first.");
  }

  let questionsData: ReturnType<typeof cloneQuestionsData> = [];
  let sourceLabel: Record<string, unknown> = { kind: source.kind };

  if (source.kind === "version") {
    const src = await prisma.formVersion.findUnique({
      where: { id: source.versionId },
      include: formVersionInclude,
    });
    if (!src) throw new NotFoundError("Source form");
    assertSameWorkspace(actor, src.campaign.workspaceId);
    questionsData = cloneQuestionsData(src.questions.map(toQuestionDefinition));
    sourceLabel = { kind: "version", versionId: src.id, campaignId: src.campaignId };
  } else if (source.kind === "template") {
    const tpl = await prisma.formTemplate.findUnique({ where: { id: source.templateId } });
    if (!tpl) throw new NotFoundError("Template");
    assertSameWorkspace(actor, tpl.workspaceId);
    const drafts = Array.isArray(tpl.questionsJson) ? tpl.questionsJson : [];
    const keys: string[] = [];
    questionsData = drafts.map((raw, i) => {
      const parsed = questionDraftSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError({ template: [`Template question ${i + 1} is invalid.`] });
      }
      const data = questionDraftToCreateData(parsed.data, i, keys);
      keys.push(data.key);
      return data;
    });
    sourceLabel = { kind: "template", templateId: tpl.id };
  }

  const nextNumber = Math.max(0, ...campaign.versions.map((v) => v.versionNumber)) + 1;

  return prisma.$transaction(async (tx) => {
    const version = await tx.formVersion.create({
      data: {
        campaignId: campaign.id,
        versionNumber: nextNumber,
        status: "DRAFT",
        createdById: actor.userId,
        questions: { create: questionsData },
      },
      include: formVersionInclude,
    });
    await audit(tx, actor, {
      action: source.kind === "blank" ? "FORM_VERSION_CREATED" : "FORM_VERSION_CLONED",
      entityType: "FormVersion",
      entityId: version.id,
      metadata: { versionNumber: nextNumber, source: sourceLabel },
    });
    return version;
  });
}

export async function updateDraftMeta(
  actor: Actor,
  versionId: string,
  data: { introText?: string | null; estimatedMinutes?: number | null },
) {
  assertPermission(actor.role, "form:edit");
  const version = await getVersionForActor(actor, versionId);
  assertDraft(version);
  return prisma.formVersion.update({
    where: { id: version.id },
    data: {
      introText: data.introText === undefined ? undefined : data.introText,
      estimatedMinutes: data.estimatedMinutes === undefined ? undefined : data.estimatedMinutes,
    },
  });
}

export function assertDraft(version: { status: string }) {
  if (version.status !== "DRAFT") {
    throw new AppError(
      "CONFLICT",
      "Published versions are immutable. Create a new version to make changes.",
      409,
    );
  }
}

// ───────────────────────── Publish ─────────────────────────

export interface PublishResult {
  versionId: string;
  versionNumber: number;
  linkSlug: string;
  questionCount: number;
  estimatedMinutes: number;
}

/**
 * Publish a draft (PRD §24, §66, §77). Runs as one transaction:
 * validate → archive previous published version + expire its links →
 * mark published → create link → activate campaign → audit.
 */
export async function publishVersion(actor: Actor, versionId: string): Promise<PublishResult> {
  assertPermission(actor.role, "campaign:publish");
  const version = await getVersionForActor(actor, versionId);
  assertDraft(version);

  const definition = toFormDefinition(version);
  const issues = checkPublishable(definition);
  if (issues.length) {
    throw new ValidationError(
      { publish: issues.map((i) => i.message) },
      "The form is not ready to publish.",
    );
  }

  const estimated = version.estimatedMinutes ?? estimateMinutes(definition.questions);

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateLinkSlug(version.campaign.name);
    try {
      return await prisma.$transaction(async (tx) => {
        // Re-check inside the transaction to avoid a race with a concurrent publish.
        const fresh = await tx.formVersion.findUnique({ where: { id: version.id }, select: { status: true } });
        if (!fresh || fresh.status !== "DRAFT") {
          throw new ConflictError("This version was already published.");
        }

        await tx.formVersion.updateMany({
          where: { campaignId: version.campaignId, status: "PUBLISHED" },
          data: { status: "ARCHIVED" },
        });
        await tx.feedbackLink.updateMany({
          where: { campaignId: version.campaignId, status: { in: ["ACTIVE", "PAUSED"] } },
          data: { status: "EXPIRED" },
        });

        const published = await tx.formVersion.update({
          where: { id: version.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), estimatedMinutes: estimated },
        });

        const link = await tx.feedbackLink.create({
          data: {
            campaignId: version.campaignId,
            formVersionId: version.id,
            slug,
            status: "ACTIVE",
            expiresAt: version.campaign.endsAt,
          },
        });

        await tx.campaign.update({
          where: { id: version.campaignId },
          data: { status: "ACTIVE" },
        });

        await audit(tx, actor, {
          action: "FORM_PUBLISHED",
          entityType: "FormVersion",
          entityId: version.id,
          metadata: { versionNumber: published.versionNumber, linkSlug: slug, questions: definition.questions.length },
        });

        return {
          versionId: published.id,
          versionNumber: published.versionNumber,
          linkSlug: link.slug,
          questionCount: definition.questions.length,
          estimatedMinutes: estimated,
        };
      });
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }
  throw new ConflictError("Could not allocate a unique link. Please try again.");
}

export async function setLinkStatus(actor: Actor, linkId: string, status: "ACTIVE" | "PAUSED" | "EXPIRED") {
  assertPermission(actor.role, "campaign:publish");
  const link = await prisma.feedbackLink.findUnique({
    where: { id: linkId },
    include: { campaign: { select: { workspaceId: true } }, formVersion: { select: { status: true } } },
  });
  if (!link) throw new NotFoundError("Link");
  assertSameWorkspace(actor, link.campaign.workspaceId);
  if (status === "ACTIVE" && link.formVersion.status !== "PUBLISHED") {
    throw new ConflictError("Only links for the currently published version can be activated.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.feedbackLink.update({ where: { id: link.id }, data: { status } });
    await audit(tx, actor, {
      action: status === "ACTIVE" ? "LINK_STATUS_CHANGED" : "FORM_DEACTIVATED",
      entityType: "FeedbackLink",
      entityId: link.id,
      metadata: { status },
    });
    return updated;
  });
}

// ───────────────────────── Public form ─────────────────────────

export interface PublicFormResult {
  form: FormDefinition;
  linkId: string;
  campaignStatus: string;
}

/**
 * Resolve a public slug to a published form, enforcing every gate in PRD §78:
 * link active, campaign active, version published, date window, response limit.
 */
export async function getPublicForm(slug: string): Promise<PublicFormResult> {
  const link = await prisma.feedbackLink.findUnique({
    where: { slug },
    include: { formVersion: { include: formVersionInclude } },
  });
  if (!link) throw new NotFoundError("Feedback form");

  const { formVersion } = link;
  const campaign = formVersion.campaign;
  const now = new Date();

  if (link.status === "EXPIRED" || (link.expiresAt && link.expiresAt < now)) {
    throw new AppError("LINK_EXPIRED", "This feedback link has expired.", 410);
  }
  if (link.status === "PAUSED" || campaign.status === "PAUSED") {
    throw new AppError("FORM_CLOSED", "This feedback form is temporarily unavailable.", 423);
  }
  if (campaign.status !== "ACTIVE" || formVersion.status !== "PUBLISHED") {
    throw new AppError("FORM_CLOSED", "This feedback form is no longer accepting responses.", 410);
  }
  if (campaign.startsAt && campaign.startsAt > now) {
    throw new AppError("FORM_CLOSED", "This feedback form is not open yet.", 423);
  }
  if (campaign.endsAt && campaign.endsAt < now) {
    throw new AppError("FORM_CLOSED", "This feedback form is no longer accepting responses.", 410);
  }
  if (campaign.maxResponses != null) {
    const count = await prisma.submission.count({
      where: { campaignId: campaign.id, status: "COMPLETED" },
    });
    if (count >= campaign.maxResponses) {
      throw new AppError("RESPONSE_LIMIT_REACHED", "This feedback form has reached its response limit.", 410);
    }
  }

  return { form: toFormDefinition(formVersion), linkId: link.id, campaignStatus: campaign.status };
}

/** Definition for admin preview — same renderer as the public form (PRD §23). */
export async function getPreviewForm(actor: Actor, versionId: string): Promise<FormDefinition> {
  return getVersionDefinition(actor, versionId);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export type { Prisma };
