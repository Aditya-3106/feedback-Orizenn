/**
 * Publishing is all-or-nothing (PRD §24, §66, §77).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/api/errors";
import { campaignInputSchema } from "@/lib/validation/campaign";
import { questionDraftSchema } from "@/lib/validation/question";
import { DRAFT_QUESTIONS, createFixture, enabled, expectAppError, loadModules, type Fixture, type Modules } from "./helpers";

describe.skipIf(!enabled)("publish transaction (DB)", () => {
  let m: Modules;
  let fx: Fixture;
  let campaignId: string;
  let versionId: string;

  beforeAll(async () => {
    m = await loadModules();
    fx = await createFixture(m.prisma, "publish");
    const campaign = await m.campaigns.createCampaign(
      fx.admin,
      campaignInputSchema.parse({ name: "Publish campaign", goal: "Verify that publishing is transactional and validated." }),
    );
    campaignId = campaign.id;
    const draft = await m.forms.createDraftVersion(fx.admin, campaignId, { kind: "blank" });
    versionId = draft.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
    await m?.prisma.$disconnect();
  });

  it("publishing a draft with zero questions fails validation and changes nothing", async () => {
    let error: unknown;
    try {
      await m.forms.publishVersion(fx.admin, versionId);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toEqual({ publish: ["Add at least one question before publishing."] });

    const version = await m.prisma.formVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.status).toBe("DRAFT");
    expect(version.publishedAt).toBeNull();
    const campaign = await m.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.status).toBe("DRAFT");
    expect(await m.prisma.feedbackLink.count({ where: { campaignId } })).toBe(0);
    expect(await m.prisma.auditLog.count({ where: { action: "FORM_PUBLISHED", entityId: versionId } })).toBe(0);
  });

  it("publishing a draft with an invalid question reports every issue and changes nothing", async () => {
    // Bypass the draft schema deliberately to plant a broken row.
    await m.prisma.question.create({
      data: {
        formVersionId: versionId,
        key: "q_broken",
        position: 0,
        text: "Pick one",
        type: "SINGLE_CHOICE",
        analyticsType: "THEME_CLUSTER",
      },
    });
    let error: unknown;
    try {
      await m.forms.publishVersion(fx.admin, versionId);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ValidationError);
    const messages = (error as ValidationError).fields?.publish ?? [];
    expect(messages).toContain("Question 1: choice questions need at least 2 options.");
    expect(messages).toContain('Question 1: analytics type "THEME_CLUSTER" does not apply to SINGLE_CHOICE.');
    expect((await m.prisma.formVersion.findUniqueOrThrow({ where: { id: versionId } })).status).toBe("DRAFT");
    expect(await m.prisma.feedbackLink.count({ where: { campaignId } })).toBe(0);

    await m.prisma.question.deleteMany({ where: { formVersionId: versionId, key: "q_broken" } });
  });

  it("publishes once the draft is valid, then refuses to publish the same version again", async () => {
    await m.questions.addQuestion(fx.admin, versionId, questionDraftSchema.parse(DRAFT_QUESTIONS.rating));
    await m.questions.addQuestion(fx.admin, versionId, questionDraftSchema.parse(DRAFT_QUESTIONS.choice));

    const result = await m.forms.publishVersion(fx.admin, versionId);
    expect(result.versionId).toBe(versionId);
    expect(result.questionCount).toBe(2);

    const version = await m.prisma.formVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.status).toBe("PUBLISHED");
    expect(version.publishedAt).toBeInstanceOf(Date);
    expect(version.estimatedMinutes).toBe(result.estimatedMinutes);
    expect((await m.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("ACTIVE");
    expect(await m.prisma.feedbackLink.count({ where: { campaignId, status: "ACTIVE" } })).toBe(1);
    expect(await m.prisma.auditLog.count({ where: { action: "FORM_PUBLISHED", entityId: versionId } })).toBe(1);

    await expectAppError(m.forms.publishVersion(fx.admin, versionId), "CONFLICT");
    expect(await m.prisma.feedbackLink.count({ where: { campaignId } })).toBe(1);
  });

  it("publishing v2 archives v1 and expires its link in the same transaction", async () => {
    const v2 = await m.forms.createDraftVersion(fx.admin, campaignId, { kind: "version", versionId });
    const result = await m.forms.publishVersion(fx.admin, v2.id);
    expect(result.versionNumber).toBe(2);

    const v1 = await m.prisma.formVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(v1.status).toBe("ARCHIVED");
    const links = await m.prisma.feedbackLink.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" } });
    expect(links.map((l) => l.status)).toEqual(["EXPIRED", "ACTIVE"]);
    expect(links[1].formVersionId).toBe(v2.id);
    expect(links[1].slug).toBe(result.linkSlug);

    // The old link no longer serves a form.
    await expectAppError(m.forms.getPublicForm(links[0].slug), "LINK_EXPIRED");
    const pub = await m.forms.getPublicForm(result.linkSlug);
    expect(pub.form.versionNumber).toBe(2);
  });
});
