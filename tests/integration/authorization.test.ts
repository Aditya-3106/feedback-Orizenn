/**
 * Role and tenancy enforcement at the service layer (PRD §81, §111).
 * Unauthenticated access is enforced by `requireActor` in the Next.js request
 * context and is covered by e2e tests, not here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/api/errors";
import { campaignInputSchema } from "@/lib/validation/campaign";
import { questionDraftSchema } from "@/lib/validation/question";
import { DRAFT_QUESTIONS, createFixture, enabled, expectAppError, loadModules, type Fixture, type Modules } from "./helpers";

describe.skipIf(!enabled)("authorization (DB)", () => {
  let m: Modules;
  let fx: Fixture;
  let campaignId: string;
  let versionId: string;

  const campaignInput = campaignInputSchema.parse({
    name: "Authz campaign",
    goal: "Make sure analysts and outsiders cannot mutate or read what they should not.",
  });

  beforeAll(async () => {
    m = await loadModules();
    fx = await createFixture(m.prisma, "authz");
    const campaign = await m.campaigns.createCampaign(fx.admin, campaignInput);
    campaignId = campaign.id;
    const draft = await m.forms.createDraftVersion(fx.admin, campaignId, { kind: "blank" });
    versionId = draft.id;
    await m.questions.addQuestion(fx.admin, versionId, questionDraftSchema.parse(DRAFT_QUESTIONS.rating));
  });

  afterAll(async () => {
    await fx?.cleanup();
    await m?.prisma.$disconnect();
  });

  describe("ANALYST is read-only", () => {
    it("cannot create campaigns", async () => {
      await expect(m.campaigns.createCampaign(fx.analyst, campaignInput)).rejects.toBeInstanceOf(ForbiddenError);
      expect(await m.prisma.campaign.count({ where: { workspaceId: fx.workspaceId } })).toBe(1);
    });

    it("cannot add questions", async () => {
      await expect(m.questions.addQuestion(fx.analyst, versionId, questionDraftSchema.parse(DRAFT_QUESTIONS.text))).rejects.toBeInstanceOf(ForbiddenError);
      expect(await m.prisma.question.count({ where: { formVersionId: versionId } })).toBe(1);
    });

    it("cannot publish", async () => {
      await expect(m.forms.publishVersion(fx.analyst, versionId)).rejects.toBeInstanceOf(ForbiddenError);
      const version = await m.prisma.formVersion.findUniqueOrThrow({ where: { id: versionId } });
      expect(version.status).toBe("DRAFT");
    });

    it("cannot create a draft version or change campaign status", async () => {
      await expect(m.forms.createDraftVersion(fx.analyst, campaignId, { kind: "blank" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(m.campaigns.setCampaignStatus(fx.analyst, campaignId, "ARCHIVED")).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("can read campaigns, versions and submissions in its own workspace", async () => {
      const campaign = await m.campaigns.getCampaign(fx.analyst, campaignId);
      expect(campaign.id).toBe(campaignId);
      const version = await m.forms.getVersionForActor(fx.analyst, versionId);
      expect(version.questions).toHaveLength(1);
      const list = await m.submissions.listSubmissions(fx.analyst, campaignId, { filters: {} });
      expect(list.total).toBe(0);
    });
  });

  describe("ADMIN from another workspace", () => {
    it("cannot read the campaign", async () => {
      await expectAppError(m.campaigns.getCampaign(fx.outsider, campaignId), "FORBIDDEN", "NOT_FOUND");
    });

    it("cannot read the form version", async () => {
      await expectAppError(m.forms.getVersionForActor(fx.outsider, versionId), "FORBIDDEN", "NOT_FOUND");
    });

    it("cannot list submissions", async () => {
      await expectAppError(m.submissions.listSubmissions(fx.outsider, campaignId, { filters: {} }), "FORBIDDEN", "NOT_FOUND");
    });

    it("cannot mutate: add question, publish, create draft, update campaign", async () => {
      await expectAppError(m.questions.addQuestion(fx.outsider, versionId, questionDraftSchema.parse(DRAFT_QUESTIONS.text)), "FORBIDDEN", "NOT_FOUND");
      await expectAppError(m.forms.publishVersion(fx.outsider, versionId), "FORBIDDEN", "NOT_FOUND");
      await expectAppError(m.forms.createDraftVersion(fx.outsider, campaignId, { kind: "version", versionId }), "FORBIDDEN", "NOT_FOUND");
      await expectAppError(m.campaigns.updateCampaign(fx.outsider, campaignId, campaignInput), "FORBIDDEN", "NOT_FOUND");
      expect(await m.prisma.question.count({ where: { formVersionId: versionId } })).toBe(1);
    });

    it("cannot load analytics or exports", async () => {
      await expectAppError(m.analytics.loadDashboard(fx.outsider, campaignId, {}), "FORBIDDEN", "NOT_FOUND");
      await expectAppError(m.exportsSvc.generateExport(fx.outsider, campaignId, { type: "RAW_RESPONSES", filters: {} }), "FORBIDDEN", "NOT_FOUND");
    });

    it("does not see the campaign in its own listing", async () => {
      const mine = await m.campaigns.listCampaigns(fx.outsider);
      expect(mine.map((c) => c.id)).not.toContain(campaignId);
    });
  });

  describe("same-workspace roles", () => {
    it("SUPER_ADMIN and ADMIN can read the campaign", async () => {
      expect((await m.campaigns.getCampaign(fx.superAdmin, campaignId)).id).toBe(campaignId);
      expect((await m.campaigns.getCampaign(fx.admin, campaignId)).id).toBe(campaignId);
    });
  });
});
