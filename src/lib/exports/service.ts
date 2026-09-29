import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/api/errors";
import { loadDashboard } from "@/lib/analytics/load";
import { audit } from "@/lib/audit/log";
import type { AnswerValue } from "@/lib/forms/definitions";
import { formVersionInclude, toFormDefinition } from "@/lib/forms/mapper";
import { assertPermission, assertSameWorkspace, type Actor } from "@/lib/security/authz";
import { presentRespondent } from "@/lib/submissions/privacy";
import { submissionWhere } from "@/lib/submissions/where";
import type { ExportRequest } from "@/lib/validation/export";
import { buildWorkbook, exportFileName, type ExportData, type ExportRow } from "./excel";

const PAGE = 1000;

function describeFilters(f: ExportRequest["filters"]): string {
  const parts: string[] = [];
  if (f.from) parts.push(`from ${f.from.toISOString().slice(0, 10)}`);
  if (f.to) parts.push(`to ${f.to.toISOString().slice(0, 10)}`);
  for (const k of ["college", "branch", "year", "projectType", "status", "usage"] as const) {
    if (f[k]) parts.push(`${k}=${f[k]}`);
  }
  return parts.join(", ");
}

function toAnswerValue(a: { numberValue: number | null; booleanValue: boolean | null; textValue: string | null; jsonValue: unknown }): AnswerValue | null {
  if (a.numberValue != null) return { kind: "number", value: a.numberValue };
  if (a.booleanValue != null) return { kind: "boolean", value: a.booleanValue };
  if (a.textValue != null) return { kind: "text", value: a.textValue };
  if (Array.isArray(a.jsonValue)) return { kind: "json", value: a.jsonValue.map(String) };
  return null;
}

/**
 * Generate an Excel export (PRD §50–§51, §128). Streams submissions in pages so
 * large campaigns never load everything at once; the same `submissionWhere`
 * used by the dashboard guarantees the filtered export matches the filtered view.
 */
export async function generateExport(
  actor: Actor,
  campaignId: string,
  request: ExportRequest,
): Promise<{ fileName: string; buffer: Buffer; rowCount: number; exportJobId: string }> {
  assertPermission(actor.role, "export:create");

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);

  const version = request.filters.versionId
    ? await prisma.formVersion.findFirst({ where: { id: request.filters.versionId, campaignId }, include: formVersionInclude })
    : (await prisma.formVersion.findFirst({ where: { campaignId, status: "PUBLISHED" }, include: formVersionInclude })) ??
      (await prisma.formVersion.findFirst({ where: { campaignId }, orderBy: { versionNumber: "desc" }, include: formVersionInclude }));
  if (!version) throw new NotFoundError("Form version");

  const job = await prisma.exportJob.create({
    data: {
      campaignId,
      requestedById: actor.userId,
      type: request.type,
      status: "PENDING",
      filtersJson: JSON.parse(JSON.stringify(request.filters)),
    },
  });

  try {
    const definition = toFormDefinition(version);
    const where = submissionWhere(campaignId, version.id, request.filters);

    const rows: ExportRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await prisma.submission.findMany({
        where,
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: { respondent: true, answers: true },
      });
      for (const s of batch) {
        const answers: Record<string, AnswerValue | null> = {};
        for (const a of s.answers) answers[a.questionId] = toAnswerValue(a);
        rows.push({
          submissionId: s.id,
          submittedAt: s.submittedAt,
          status: s.status,
          usageStatus: s.usageVerificationStatus,
          durationSeconds: s.durationSeconds,
          consentToQuote: s.consentToQuote,
          respondent: presentRespondent(campaign.responseMode, s.respondent, rows.length),
          answers,
        });
      }
      if (batch.length < PAGE) break;
      cursor = batch[batch.length - 1].id;
    }

    const needsDashboard = request.type === "ANALYTICS_SUMMARY" || request.type === "FULL_WORKBOOK";
    const dashboard = needsDashboard
      ? await loadDashboard(actor, campaignId, { ...request.filters, versionId: version.id })
      : null;

    const generatedAt = new Date();
    const data: ExportData = {
      type: request.type,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        goal: campaign.goal,
        responseMode: campaign.responseMode,
        status: campaign.status,
        createdAt: campaign.createdAt,
      },
      version: { versionNumber: version.versionNumber, publishedAt: version.publishedAt, createdAt: version.createdAt },
      questions: definition.questions,
      rows,
      dashboard,
      filtersDescription: describeFilters(request.filters),
      generatedAt,
    };

    const buffer = await buildWorkbook(data);
    const fileName = exportFileName(campaign.name, request.type, generatedAt);

    await prisma.$transaction(async (tx) => {
      await tx.exportJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", fileName, completedAt: new Date() },
      });
      await audit(tx, actor, {
        action: "EXPORT_GENERATED",
        entityType: "ExportJob",
        entityId: job.id,
        metadata: { campaignId, type: request.type, rows: rows.length, fileName },
      });
    });

    return { fileName, buffer, rowCount: rows.length, exportJobId: job.id };
  } catch (err) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Unknown error" },
    });
    throw err;
  }
}

export async function listWorkspaceExportJobs(actor: Actor) {
  assertPermission(actor.role, "export:create");
  return prisma.exportJob.findMany({
    where: { campaign: { workspaceId: actor.workspaceId } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { requestedBy: { select: { name: true } }, campaign: { select: { id: true, name: true } } },
  });
}

export async function listExportJobs(actor: Actor, campaignId: string) {
  assertPermission(actor.role, "export:create");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { workspaceId: true } });
  if (!campaign) throw new NotFoundError("Campaign");
  assertSameWorkspace(actor, campaign.workspaceId);
  return prisma.exportJob.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { requestedBy: { select: { name: true } } },
  });
}
