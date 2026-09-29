import type { Prisma } from "@/generated/prisma/client";
import type { AnalyticsFilters } from "@/lib/validation/filters";

/**
 * Build the Prisma where-clause for submissions matching the dashboard/export
 * filters (PRD §46, §128). Shared by analytics, response explorer and exports
 * so "filtered export contains exactly the filtered dataset" holds by construction.
 */
export function submissionWhere(
  campaignId: string,
  formVersionId: string | undefined,
  filters: AnalyticsFilters,
): Prisma.SubmissionWhereInput {
  const where: Prisma.SubmissionWhereInput = {
    campaignId,
    status: filters.status ?? "COMPLETED",
  };
  if (formVersionId) where.formVersionId = formVersionId;

  if (filters.from || filters.to) {
    where.submittedAt = {};
    if (filters.from) where.submittedAt.gte = filters.from;
    if (filters.to) {
      // Inclusive end-of-day.
      const end = new Date(filters.to);
      end.setUTCHours(23, 59, 59, 999);
      where.submittedAt.lte = end;
    }
  }

  if (filters.usage) where.usageVerificationStatus = filters.usage;

  const respondent: Prisma.RespondentWhereInput = {};
  if (filters.college) respondent.college = { equals: filters.college, mode: "insensitive" };
  if (filters.branch) respondent.branch = { equals: filters.branch, mode: "insensitive" };
  if (filters.year) respondent.year = { equals: filters.year, mode: "insensitive" };
  if (filters.projectType) respondent.projectType = { equals: filters.projectType, mode: "insensitive" };
  if (Object.keys(respondent).length) where.respondent = respondent;

  return where;
}
