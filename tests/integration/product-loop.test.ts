/**
 * The critical product loop against a real database (PRD §108, §113):
 * create campaign → draft → questions → publish → public form → submissions →
 * dashboard → export → new version cloned from the published one → immutability.
 *
 * Runs only when DATABASE_URL is set and RUN_DB_TESTS=true.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RatingDistributionBlock } from "@/lib/analytics/types";
import type { FormDefinition } from "@/lib/forms/definitions";
import { campaignInputSchema } from "@/lib/validation/campaign";
import { questionDraftSchema } from "@/lib/validation/question";
import { DRAFT_QUESTIONS, createFixture, enabled, expectAppError, loadModules, type Fixture, type Modules } from "./helpers";

describe.skipIf(!enabled)("product loop (DB)", () => {
  let m: Modules;
  let fx: Fixture;
  let campaignId: string;
  let v1Id: string;
  let linkSlug: string;
  let form: FormDefinition;
  const ratings = [5, 5, 4, 4, 3, 3]; // average 4.0
  const choices = ["yes", "yes", "no", "not_sure", "yes", "no"];
  const submissionIds: string[] = [];

  beforeAll(async () => {
    m = await loadModules();
    fx = await createFixture(m.prisma, "loop");
  });

  afterAll(async () => {
    await fx?.cleanup();
    await m?.prisma.$disconnect();
  });

  it("creates a campaign", async () => {
    const campaign = await m.campaigns.createCampaign(
      fx.admin,
      campaignInputSchema.parse({
        name: "September student feedback",
        goal: "Understand whether the Orizenn analysis was useful and where students got confused.",
        responseMode: "PSEUDONYMOUS",
      }),
    );
    campaignId = campaign.id;
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.workspaceId).toBe(fx.workspaceId);
    expect(campaign.slug).toMatch(/^september-student-feedback-[a-z0-9]{4}$/);
  });

  it("creates a blank draft version and adds three questions", async () => {
    const draft = await m.forms.createDraftVersion(fx.admin, campaignId, { kind: "blank" });
    v1Id = draft.id;
    expect(draft.versionNumber).toBe(1);
    expect(draft.status).toBe("DRAFT");
    expect(draft.questions).toEqual([]);

    const q1 = await m.questions.addQuestion(fx.admin, v1Id, questionDraftSchema.parse(DRAFT_QUESTIONS.rating));
    const q2 = await m.questions.addQuestion(fx.admin, v1Id, questionDraftSchema.parse(DRAFT_QUESTIONS.choice));
    const q3 = await m.questions.addQuestion(fx.admin, v1Id, questionDraftSchema.parse(DRAFT_QUESTIONS.text));

    expect([q1.position, q2.position, q3.position]).toEqual([0, 1, 2]);
    expect(q1.key).toBe("q_how_useful_was_orizenn_for_your_project");
    expect(q1.validation).toEqual({ min: 1, max: 5 });
    expect(q2.options.map((o) => o.value)).toEqual(["yes", "no", "not_sure"]);
    expect(q3.required).toBe(false);
    expect(q3.analyticsType).toBe("THEME_CLUSTER");
  });

  it("publishes the version: link created, campaign ACTIVE", async () => {
    const result = await m.forms.publishVersion(fx.admin, v1Id);
    linkSlug = result.linkSlug;
    expect(result.versionNumber).toBe(1);
    expect(result.questionCount).toBe(3);
    expect(result.estimatedMinutes).toBeGreaterThanOrEqual(1);
    expect(linkSlug).toMatch(/^september-student-feedback-[a-z0-9]{6}$/);

    const campaign = await m.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.status).toBe("ACTIVE");
    const version = await m.prisma.formVersion.findUniqueOrThrow({ where: { id: v1Id } });
    expect(version.status).toBe("PUBLISHED");
    expect(version.publishedAt).toBeInstanceOf(Date);
    expect(await m.prisma.feedbackLink.count({ where: { formVersionId: v1Id, status: "ACTIVE" } })).toBe(1);
  });

  it("resolves the public form by slug", async () => {
    const pub = await m.forms.getPublicForm(linkSlug);
    form = pub.form;
    expect(pub.campaignStatus).toBe("ACTIVE");
    expect(form.versionId).toBe(v1Id);
    expect(form.questions).toHaveLength(3);
    expect(form.questions.map((q) => q.type)).toEqual(["RATING", "SINGLE_CHOICE", "LONG_TEXT"]);
    expect(form.campaign.responseMode).toBe("PSEUDONYMOUS");
  });

  it("accepts six valid submissions", async () => {
    const [qRating, qChoice, qText] = form.questions;
    for (let i = 0; i < 6; i++) {
      const res = await m.submissions.submitResponse({
        slug: linkSlug,
        requestHash: "test",
        payload: {
          clientToken: `loop-token-${i}-${Date.now()}`,
          startedAt: new Date(Date.now() - 90_000).toISOString(),
          respondent: { college: i % 2 ? "IIT Bombay" : "NIT Trichy", year: String((i % 3) + 1) },
          answers: {
            [qRating.id]: ratings[i],
            [qChoice.id]: choices[i],
            [qText.id]: i < 4 ? `The terminology was confusing (${i})` : "",
          },
        },
      });
      expect(res.duplicate).toBe(false);
      expect(res.submissionId).not.toBe("ignored");
      submissionIds.push(res.submissionId);
    }
    expect(new Set(submissionIds).size).toBe(6);
    expect(await m.prisma.answer.count({ where: { submissionId: { in: submissionIds } } })).toBe(6 + 6 + 4);
  });

  it("re-using a client token is idempotent (duplicate: true, no new row)", async () => {
    const token = `loop-dup-${Date.now()}`;
    const [qRating, qChoice] = form.questions;
    const payload = { clientToken: token, respondent: {}, answers: { [qRating.id]: 4, [qChoice.id]: "yes" } };
    const first = await m.submissions.submitResponse({ slug: linkSlug, requestHash: "test", payload });
    expect(first.duplicate).toBe(false);
    submissionIds.push(first.submissionId);
    const before = await m.prisma.submission.count({ where: { campaignId } });

    const again = await m.submissions.submitResponse({ slug: linkSlug, requestHash: "test", payload });
    expect(again).toEqual({ submissionId: first.submissionId, duplicate: true });
    expect(await m.prisma.submission.count({ where: { campaignId } })).toBe(before);

    // Remove the extra row so the counts below match the six planned submissions.
    await m.prisma.submission.delete({ where: { id: first.submissionId } });
    submissionIds.pop();
  });

  it("rejects an invalid submission with field errors and stores nothing", async () => {
    const [qRating, qChoice] = form.questions;
    const before = await m.prisma.submission.count({ where: { campaignId } });
    await expectAppError(
      m.submissions.submitResponse({
        slug: linkSlug,
        requestHash: "test",
        payload: { clientToken: `loop-bad-${Date.now()}`, respondent: {}, answers: { [qRating.id]: 9, [qChoice.id]: "banana", bogus: "x" } },
      }),
      "VALIDATION_ERROR",
    );
    expect(await m.prisma.submission.count({ where: { campaignId } })).toBe(before);
  });

  it("lists six submissions with pseudonymous labels", async () => {
    const list = await m.submissions.listSubmissions(fx.admin, campaignId, { filters: {} });
    expect(list.total).toBe(6);
    expect(list.items).toHaveLength(6);
    expect(list.items.map((i) => i.respondent.label).sort()).toEqual(["Student 01", "Student 02", "Student 03", "Student 04", "Student 05", "Student 06"]);
    expect(list.items.every((i) => i.respondent.email === null && !i.respondent.identityShown)).toBe(true);
    expect(list.items.every((i) => i.versionNumber === 1)).toBe(true);
  });

  it("filters submissions through the shared where-clause", async () => {
    const filtered = await m.submissions.listSubmissions(fx.admin, campaignId, { filters: { college: "iit bombay" } });
    expect(filtered.total).toBe(3);
  });

  it("builds a dashboard with responseCount 6 and the correct rating average", async () => {
    const dashboard = await m.analytics.loadDashboard(fx.admin, campaignId, {});
    expect(dashboard).not.toBeNull();
    if (!dashboard) return;
    expect(dashboard.responseCount).toBe(6);
    expect(dashboard.versionId).toBe(v1Id);
    expect(dashboard.insufficientData).toBe(false);
    expect(dashboard.summary[0]).toBe("6 students responded.");

    const rating = dashboard.blocks.find((b) => b.kind === "RATING_DISTRIBUTION") as RatingDistributionBlock;
    expect(rating.answerCount).toBe(6);
    expect(rating.average).toBe(4);
    expect(rating.distribution.map((d) => d.count)).toEqual([0, 0, 2, 2, 2]);

    const choice = dashboard.blocks.find((b) => b.kind === "OPTION_DISTRIBUTION");
    expect(choice?.kind === "OPTION_DISTRIBUTION" && choice.top?.label).toBe("Yes");

    expect(dashboard.themes).toHaveLength(1);
    expect(dashboard.themes[0].answerCount).toBe(4);
  });

  it("generates a FULL_WORKBOOK export whose Responses sheet has 7 rows", async () => {
    const out = await m.exportsSvc.generateExport(fx.admin, campaignId, { type: "FULL_WORKBOOK", filters: {} });
    expect(out.rowCount).toBe(6);
    expect(out.fileName).toMatch(/^september-student-feedback-full-workbook-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.buffer as unknown as ArrayBuffer); // exceljs types its own Buffer; Node buffers work at runtime
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Responses", "Question Summary", "Student Data", "Themes", "Campaign Metadata"]);
    const ws = wb.getWorksheet("Responses");
    expect(ws?.rowCount).toBe(7);
    const headers = (ws?.getRow(1).values as ExcelJS.CellValue[]).slice(1);
    expect(headers).not.toContain("Email");
    expect(headers[1]).toBe("Student");
    expect(headers.at(-3)).toBe("Q1. How useful was Orizenn for your project?");

    const job = await m.prisma.exportJob.findUniqueOrThrow({ where: { id: out.exportJobId } });
    expect(job.status).toBe("COMPLETED");
  });

  it("creates v2 from the published version with the same keys, leaving v1 untouched", async () => {
    const v1Before = await m.forms.getVersionForActor(fx.admin, v1Id);
    const v2 = await m.forms.createDraftVersion(fx.admin, campaignId, { kind: "version", versionId: v1Id });

    expect(v2.versionNumber).toBe(2);
    expect(v2.status).toBe("DRAFT");
    expect(v2.questions.map((q) => q.key)).toEqual(v1Before.questions.map((q) => q.key));
    expect(v2.questions.map((q) => q.position)).toEqual([0, 1, 2]);
    expect(v2.questions.map((q) => q.id)).not.toEqual(expect.arrayContaining(v1Before.questions.map((q) => q.id)));
    expect(v2.questions[1].options.map((o) => o.value)).toEqual(["yes", "no", "not_sure"]);
    expect(v2.questions[0].comparableKey).toBe("usefulness");

    const v1After = await m.forms.getVersionForActor(fx.admin, v1Id);
    expect(v1After.status).toBe("PUBLISHED");
    expect(v1After.questions.map((q) => ({ id: q.id, key: q.key, text: q.text, position: q.position }))).toEqual(
      v1Before.questions.map((q) => ({ id: q.id, key: q.key, text: q.text, position: q.position })),
    );
    expect(await m.prisma.submission.count({ where: { formVersionId: v1Id } })).toBe(6);
  });

  it("refuses to edit a question on the PUBLISHED version (CONFLICT)", async () => {
    const published = await m.forms.getVersionForActor(fx.admin, v1Id);
    await expectAppError(
      m.questions.updateQuestion(fx.admin, published.questions[0].id, questionDraftSchema.parse({ ...DRAFT_QUESTIONS.rating, text: "Changed wording" })),
      "CONFLICT",
    );
    await expectAppError(m.questions.addQuestion(fx.admin, v1Id, questionDraftSchema.parse(DRAFT_QUESTIONS.text)), "CONFLICT");
    await expectAppError(m.questions.deleteQuestion(fx.admin, published.questions[0].id), "CONFLICT");
  });

  it("a second draft cannot be created while one exists", async () => {
    await expectAppError(m.forms.createDraftVersion(fx.admin, campaignId, { kind: "blank" }), "CONFLICT");
  });
});
