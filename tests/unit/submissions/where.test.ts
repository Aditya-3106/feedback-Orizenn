import { describe, expect, it } from "vitest";
import { submissionWhere } from "@/lib/submissions/where";

describe("submissionWhere (PRD §46, §128)", () => {
  it("defaults to COMPLETED submissions of the campaign", () => {
    expect(submissionWhere("c1", undefined, {})).toEqual({ campaignId: "c1", status: "COMPLETED" });
  });

  it("scopes to a form version when given", () => {
    expect(submissionWhere("c1", "v1", {})).toEqual({ campaignId: "c1", status: "COMPLETED", formVersionId: "v1" });
  });

  it("status filter overrides the default", () => {
    expect(submissionWhere("c1", undefined, { status: "ABANDONED" }).status).toBe("ABANDONED");
  });

  it("date range: gte from, lte inclusive end-of-day (UTC) for to", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-09-30T00:00:00Z");
    const where = submissionWhere("c1", undefined, { from, to });
    expect(where.submittedAt).toEqual({ gte: from, lte: new Date("2026-09-30T23:59:59.999Z") });
    // The caller's Date object is not mutated.
    expect(to.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("date range works with only one bound", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    expect(submissionWhere("c1", undefined, { from }).submittedAt).toEqual({ gte: from });
    const onlyTo = submissionWhere("c1", undefined, { to: new Date("2026-09-15T08:30:00Z") }).submittedAt;
    expect(onlyTo).toEqual({ lte: new Date("2026-09-15T23:59:59.999Z") });
  });

  it("no submittedAt / respondent keys when no such filters are set", () => {
    const where = submissionWhere("c1", undefined, { status: "COMPLETED" });
    expect(where).not.toHaveProperty("submittedAt");
    expect(where).not.toHaveProperty("respondent");
    expect(where).not.toHaveProperty("usageVerificationStatus");
  });

  it("respondent fields use case-insensitive equality", () => {
    const where = submissionWhere("c1", undefined, { college: "iit bombay", branch: "cse", year: "3", projectType: "Web app" });
    expect(where.respondent).toEqual({
      college: { equals: "iit bombay", mode: "insensitive" },
      branch: { equals: "cse", mode: "insensitive" },
      year: { equals: "3", mode: "insensitive" },
      projectType: { equals: "Web app", mode: "insensitive" },
    });
  });

  it("only the provided respondent fields are included", () => {
    expect(submissionWhere("c1", undefined, { year: "2" }).respondent).toEqual({ year: { equals: "2", mode: "insensitive" } });
  });

  it("usage maps to usageVerificationStatus", () => {
    expect(submissionWhere("c1", undefined, { usage: "VERIFIED" }).usageVerificationStatus).toBe("VERIFIED");
  });

  it("ignores segmentBy and versionId inside the filters (version comes from the explicit argument)", () => {
    const where = submissionWhere("c1", "v9", { versionId: "v1", segmentBy: "year" });
    expect(where).toEqual({ campaignId: "c1", status: "COMPLETED", formVersionId: "v9" });
  });
});
