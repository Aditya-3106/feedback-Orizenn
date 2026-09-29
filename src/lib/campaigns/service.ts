import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { audit } from "@/lib/audit/log";
import { cloneQuestionsData } from "@/lib/forms/clone";
import { toQuestionDefinition, questionInclude } from "@/lib/forms/mapper";
import type { CampaignStatus } from "@/lib/forms/definitions";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import { generateCampaignSlug } from "@/lib/utils/slug";
import type { CampaignInput } from "@/lib/validation/campaign";

export const campaignListInclude = {
  _count: { select: { submissions: { where: { status: "COMPLETED" } } } },
  versions: {
    where: { status: "PUBLISHED" },
    select: { id: true, versionNumber: true, publishedAt: true },
    take: 1,
  },
  links: { where: { status: "ACTIVE" }, select: { slug: true }, take: 1 },
  submissions: {
    where: { status: "COMPLETED" },
    orderBy: { submittedAt: "desc" },
    select: { submittedAt: true },
    take: 1,
  },
} satisfies Prisma.CampaignInclude;

export type CampaignListRow = Prisma.CampaignGetPayload<{ include: typeof campaignListInclude }>;

export interface CampaignListOptions {
  q?: string;
  status?: CampaignStatus;
  includeArchived?: boolean;
  limit?: number;
}

export async function listCampaigns(actor: Actor, opts: CampaignListOptions = {}) {
  assertPermission(actor.role, "campaign:view");
  const where: Prisma.CampaignWhereInput = { workspaceId: actor.workspaceId };
  if (opts.status) where.status = opts.status;
  else if (!opts.includeArchived) where.status = { not: "ARCHIVED" };
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: "insensitive" } },
      { description: { contains: opts.q, mode: "insensitive" } },
      { goal: { contains: opts.q, mode: "insensitive" } },
      { slug: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  return prisma.campaign.findMany({
    where,
    include: campaignListInclude,
    orderBy: { updatedAt: "desc" },
    take: opts.limit ?? 100,
  });
}

export async function getCampaign(actor: Actor, campaignId: string) {
  assertPermission(actor.role, "campaign:view");
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      ...campaignListInclude,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { _count: { select: { questions: true, submissions: true } } },
      },
      links: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);
  return campaign;
}

export type CampaignDetail = Awaited<ReturnType<typeof getCampaign>>;

export async function createCampaign(actor: Actor, input: CampaignInput) {
  assertPermission(actor.role, "campaign:create");

  // Retry on the (unlikely) slug collision inside the workspace.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateCampaignSlug(input.name);
    try {
      return await prisma.$transaction(async (tx) => {
        const campaign = await tx.campaign.create({
          data: {
            workspaceId: actor.workspaceId,
            createdById: actor.userId,
            slug,
            name: input.name,
            description: input.description,
            goal: input.goal,
            targetAudience: input.targetAudience,
            responseMode: input.responseMode,
            allowMultipleResponses: input.allowMultipleResponses,
            requireQuoteConsent: input.requireQuoteConsent,
            respondentFields: input.respondentFields,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            maxResponses: input.maxResponses,
          },
        });
        await audit(tx, actor, {
          action: "CAMPAIGN_CREATED",
          entityType: "Campaign",
          entityId: campaign.id,
          metadata: { name: campaign.name },
        });
        return campaign;
      });
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }
  throw new ConflictError("Could not allocate a unique campaign slug. Please try again.");
}

export async function updateCampaign(actor: Actor, campaignId: string, input: CampaignInput) {
  assertPermission(actor.role, "campaign:edit");
  const existing = await getCampaign(actor, campaignId);

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description ?? null,
        goal: input.goal,
        targetAudience: input.targetAudience ?? null,
        responseMode: input.responseMode,
        allowMultipleResponses: input.allowMultipleResponses,
        requireQuoteConsent: input.requireQuoteConsent,
        respondentFields: input.respondentFields,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        maxResponses: input.maxResponses ?? null,
      },
    });
    await audit(tx, actor, {
      action: "CAMPAIGN_UPDATED",
      entityType: "Campaign",
      entityId: campaign.id,
    });
    return campaign;
  });
}

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["ARCHIVED"],
  ACTIVE: ["PAUSED", "CLOSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "CLOSED", "ARCHIVED"],
  CLOSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["CLOSED"],
};

/** Campaign lifecycle (PRD §124). Publishing moves DRAFT→ACTIVE via forms/service. */
export async function setCampaignStatus(actor: Actor, campaignId: string, next: CampaignStatus) {
  assertPermission(actor.role, "campaign:publish");
  const campaign = await getCampaign(actor, campaignId);

  if (!TRANSITIONS[campaign.status].includes(next)) {
    throw new ValidationError(
      { status: [`Cannot move a ${campaign.status.toLowerCase()} campaign to ${next.toLowerCase()}.`] },
      "That status change is not allowed.",
    );
  }
  if (next === "ACTIVE") {
    const published = campaign.versions.find((v) => v.status === "PUBLISHED");
    if (!published) {
      throw new ValidationError(
        { status: ["Publish a form version before activating the campaign."] },
        "No published form.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.campaign.update({ where: { id: campaign.id }, data: { status: next } });

    // Keep public links in step with the campaign status.
    if (next === "PAUSED") {
      await tx.feedbackLink.updateMany({
        where: { campaignId: campaign.id, status: "ACTIVE" },
        data: { status: "PAUSED" },
      });
    } else if (next === "CLOSED" || next === "ARCHIVED") {
      await tx.feedbackLink.updateMany({
        where: { campaignId: campaign.id, status: { in: ["ACTIVE", "PAUSED"] } },
        data: { status: "EXPIRED" },
      });
    } else if (next === "ACTIVE") {
      const published = campaign.versions.find((v) => v.status === "PUBLISHED");
      if (published) {
        const existing = await tx.feedbackLink.findFirst({
          where: { formVersionId: published.id },
          orderBy: { createdAt: "desc" },
        });
        if (existing) {
          await tx.feedbackLink.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
        }
      }
    }

    await audit(tx, actor, {
      action: "CAMPAIGN_STATUS_CHANGED",
      entityType: "Campaign",
      entityId: campaign.id,
      metadata: { from: campaign.status, to: next },
    });
    return updated;
  });
}

/** PRD §126: new campaign + cloned draft version, no responses, new link on publish. */
export async function duplicateCampaign(actor: Actor, campaignId: string) {
  assertPermission(actor.role, "campaign:create");
  const source = await getCampaign(actor, campaignId);
  const sourceVersion =
    source.versions.find((v) => v.status === "PUBLISHED") ?? source.versions[0] ?? null;

  const questions = sourceVersion
    ? await prisma.question.findMany({
        where: { formVersionId: sourceVersion.id },
        include: questionInclude,
        orderBy: { position: "asc" },
      })
    : [];

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        workspaceId: actor.workspaceId,
        createdById: actor.userId,
        slug: generateCampaignSlug(`${source.name} copy`),
        name: `${source.name} (copy)`,
        description: source.description,
        goal: source.goal,
        targetAudience: source.targetAudience,
        responseMode: source.responseMode,
        allowMultipleResponses: source.allowMultipleResponses,
        requireQuoteConsent: source.requireQuoteConsent,
        respondentFields: source.respondentFields,
        maxResponses: source.maxResponses,
        versions: {
          create: {
            versionNumber: 1,
            status: "DRAFT",
            createdById: actor.userId,
            introText: null,
            questions: { create: cloneQuestionsData(questions.map(toQuestionDefinition)) },
          },
        },
      },
    });
    await audit(tx, actor, {
      action: "CAMPAIGN_DUPLICATED",
      entityType: "Campaign",
      entityId: campaign.id,
      metadata: { sourceCampaignId: source.id, sourceVersionId: sourceVersion?.id ?? null },
    });
    return campaign;
  });
}

export async function deleteCampaign(actor: Actor, campaignId: string) {
  assertPermission(actor.role, "campaign:delete");
  const campaign = await getCampaign(actor, campaignId);
  if (campaign._count.submissions > 0) {
    throw new ConflictError("Campaigns with responses cannot be deleted. Archive it instead.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.campaign.delete({ where: { id: campaign.id } });
    await audit(tx, actor, { action: "CAMPAIGN_DELETED", entityType: "Campaign", entityId: campaign.id });
  });
}

/** KPI cards for /admin (PRD §11). */
export async function getDashboardStats(actor: Actor) {
  assertPermission(actor.role, "campaign:view");
  const wsWhere = { campaign: { workspaceId: actor.workspaceId } };
  const [activeCampaigns, totalResponses, students, completion] = await Promise.all([
    prisma.campaign.count({ where: { workspaceId: actor.workspaceId, status: "ACTIVE" } }),
    prisma.submission.count({ where: { ...wsWhere, status: "COMPLETED" } }),
    prisma.respondent.count({ where: { workspaceId: actor.workspaceId } }),
    prisma.submission.aggregate({
      where: { ...wsWhere, status: { in: ["COMPLETED", "ABANDONED", "IN_PROGRESS"] } },
      _avg: { completionPercent: true },
    }),
  ]);
  return {
    activeCampaigns,
    totalResponses,
    students,
    avgCompletion: completion._avg.completionPercent ?? null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
