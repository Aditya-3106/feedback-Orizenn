import { describe, expect, it } from "vitest";
import {
  campaignInputFromFormData,
  campaignInputSchema,
  campaignSearchSchema,
  campaignStatusSchema,
} from "@/lib/validation/campaign";

const valid = {
  name: "September student feedback",
  goal: "Understand whether the Orizenn analysis was useful and where students got confused.",
};

function issuePaths(input: unknown): string[] {
  const r = campaignInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
}

describe("campaignInputSchema (PRD §12, §30, §75, §108)", () => {
  it("accepts a valid campaign and applies defaults", () => {
    const r = campaignInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      name: valid.name,
      goal: valid.goal,
      responseMode: "PSEUDONYMOUS",
      allowMultipleResponses: false,
      requireQuoteConsent: false,
      respondentFields: [],
    });
    expect(r.data.description).toBeUndefined();
    expect(r.data.startsAt).toBeUndefined();
    expect(r.data.maxResponses).toBeUndefined();
  });

  it("trims strings; absent optionals are undefined", () => {
    const r = campaignInputSchema.safeParse({ ...valid, name: "  Trimmed  ", targetAudience: "  Students  " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.name).toBe("Trimmed");
    expect(r.data.targetAudience).toBe("Students");
    expect(r.data.description).toBeUndefined();
  });

  it("normalises empty optional strings to undefined", () => {
    const r = campaignInputSchema.safeParse({ ...valid, description: "", targetAudience: "   " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.description).toBeUndefined();
    expect(r.data.targetAudience).toBeUndefined();
  });

  describe("name 2–100 characters", () => {
    it("rejects a 1-character name", () => {
      expect(issuePaths({ ...valid, name: "A" })).toEqual(["name"]);
    });
    it("rejects a 101-character name", () => {
      expect(issuePaths({ ...valid, name: "x".repeat(101) })).toEqual(["name"]);
    });
    it("accepts 2 and 100 characters", () => {
      expect(issuePaths({ ...valid, name: "Ab" })).toEqual([]);
      expect(issuePaths({ ...valid, name: "x".repeat(100) })).toEqual([]);
    });
    it("rejects whitespace-only names", () => {
      expect(issuePaths({ ...valid, name: "     " })).toEqual(["name"]);
    });
    it("rejects a missing name with a friendly message", () => {
      const r = campaignInputSchema.safeParse({ goal: valid.goal });
      expect(r.success).toBe(false);
      if (r.success) return;
      expect(r.error.issues[0].message).toBe("Campaign name is required.");
    });
  });

  describe("goal 10–1000 characters", () => {
    it("rejects 9 characters and whitespace padding", () => {
      expect(issuePaths({ ...valid, goal: "Too short" })).toEqual(["goal"]);
      expect(issuePaths({ ...valid, goal: "   short   " })).toEqual(["goal"]);
      expect(issuePaths({ ...valid, goal: " ".repeat(20) })).toEqual(["goal"]);
    });
    it("accepts 10 and 1000, rejects 1001", () => {
      expect(issuePaths({ ...valid, goal: "1234567890" })).toEqual([]);
      expect(issuePaths({ ...valid, goal: "g".repeat(1000) })).toEqual([]);
      expect(issuePaths({ ...valid, goal: "g".repeat(1001) })).toEqual(["goal"]);
    });
  });

  describe("dates", () => {
    it("coerces ISO strings", () => {
      const r = campaignInputSchema.safeParse({ ...valid, startsAt: "2026-09-01", endsAt: "2026-09-30" });
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.startsAt).toBeInstanceOf(Date);
      expect(r.data.endsAt?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    });

    it("endsAt must be after startsAt", () => {
      const r = campaignInputSchema.safeParse({ ...valid, startsAt: "2026-09-10", endsAt: "2026-09-01" });
      expect(r.success).toBe(false);
      if (r.success) return;
      expect(r.error.issues).toEqual([expect.objectContaining({ path: ["endsAt"], message: "Close date must be after the start date." })]);
    });

    it("equal start and end is rejected", () => {
      expect(issuePaths({ ...valid, startsAt: "2026-09-10", endsAt: "2026-09-10" })).toEqual(["endsAt"]);
    });

    it("rejects garbage dates and treats blanks as unset", () => {
      expect(issuePaths({ ...valid, startsAt: "not a date" })).toEqual(["startsAt"]);
      expect(issuePaths({ ...valid, startsAt: "", endsAt: null })).toEqual([]);
    });
  });

  describe("maxResponses", () => {
    it("rejects zero and negatives", () => {
      expect(issuePaths({ ...valid, maxResponses: 0 })).toEqual(["maxResponses"]);
      expect(issuePaths({ ...valid, maxResponses: -5 })).toEqual(["maxResponses"]);
      expect(issuePaths({ ...valid, maxResponses: "-1" })).toEqual(["maxResponses"]);
    });
    it("rejects fractions", () => {
      expect(issuePaths({ ...valid, maxResponses: 2.5 })).toEqual(["maxResponses"]);
    });
    it("coerces numeric strings and treats blank as unset", () => {
      const r = campaignInputSchema.safeParse({ ...valid, maxResponses: "25" });
      expect(r.success && r.data.maxResponses).toBe(25);
      const blank = campaignInputSchema.safeParse({ ...valid, maxResponses: "" });
      expect(blank.success && blank.data.maxResponses).toBeUndefined();
    });
  });

  describe("response mode and respondent fields", () => {
    it("anonymous campaigns cannot collect name or email", () => {
      const r = campaignInputSchema.safeParse({ ...valid, responseMode: "ANONYMOUS", respondentFields: ["name", "college"] });
      expect(r.success).toBe(false);
      if (r.success) return;
      expect(r.error.issues).toEqual([expect.objectContaining({ path: ["respondentFields"], message: "Anonymous campaigns cannot collect name or email." })]);
      expect(issuePaths({ ...valid, responseMode: "ANONYMOUS", respondentFields: ["email"] })).toEqual(["respondentFields"]);
    });

    it("anonymous campaigns may collect segment fields", () => {
      expect(issuePaths({ ...valid, responseMode: "ANONYMOUS", respondentFields: ["college", "branch", "year", "projectType"] })).toEqual([]);
    });

    it("identified campaigns may collect name and email", () => {
      expect(issuePaths({ ...valid, responseMode: "IDENTIFIED", respondentFields: ["name", "email"] })).toEqual([]);
    });

    it("rejects unknown fields and modes", () => {
      expect(issuePaths({ ...valid, respondentFields: ["ssn"] })).toEqual(["respondentFields.0"]);
      expect(issuePaths({ ...valid, responseMode: "PUBLIC" })).toEqual(["responseMode"]);
    });
  });

  describe("checkbox coercion", () => {
    it.each([
      ["on", true],
      ["true", true],
      ["1", true],
      [true, true],
      ["off", false],
      ["false", false],
      [null, false],
      [undefined, false],
      ["", false],
    ])("%j → %s", (input, expected) => {
      const r = campaignInputSchema.safeParse({ ...valid, allowMultipleResponses: input, requireQuoteConsent: input });
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.allowMultipleResponses).toBe(expected);
      expect(r.data.requireQuoteConsent).toBe(expected);
    });
  });
});

describe("campaignInputFromFormData", () => {
  it("maps FormData to a plain object the schema accepts", () => {
    const fd = new FormData();
    fd.set("name", "Form campaign");
    fd.set("goal", "Learn what students think about the report clarity.");
    fd.set("responseMode", "IDENTIFIED");
    fd.append("respondentFields", "name");
    fd.append("respondentFields", "college");
    fd.set("allowMultipleResponses", "on");
    fd.set("startsAt", "2026-09-01");
    fd.set("endsAt", "2026-10-01");
    fd.set("maxResponses", "100");
    fd.set("description", "");

    const raw = campaignInputFromFormData(fd);
    const r = campaignInputSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      name: "Form campaign",
      responseMode: "IDENTIFIED",
      respondentFields: ["name", "college"],
      allowMultipleResponses: true,
      requireQuoteConsent: false, // unchecked checkbox → null → false
      maxResponses: 100,
    });
    expect(r.data.description).toBeUndefined();
    expect(r.data.targetAudience).toBeUndefined();
    expect(r.data.startsAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("missing optional fields become undefined, not null", () => {
    const fd = new FormData();
    fd.set("name", "Minimal");
    fd.set("goal", "A goal that is long enough.");
    const raw = campaignInputFromFormData(fd) as Record<string, unknown>;
    expect(raw.description).toBeUndefined();
    expect(raw.responseMode).toBeUndefined();
    expect(raw.startsAt).toBeUndefined();
    expect(raw.maxResponses).toBeUndefined();
    expect(raw.respondentFields).toEqual([]);
    expect(campaignInputSchema.safeParse(raw).success).toBe(true);
  });
});

describe("campaign search / status schemas", () => {
  it("status enum", () => {
    expect(campaignStatusSchema.safeParse("ACTIVE").success).toBe(true);
    expect(campaignStatusSchema.safeParse("LIVE").success).toBe(false);
  });

  it("search defaults includeArchived to false and trims q", () => {
    const r = campaignSearchSchema.safeParse({ q: "  sept " });
    expect(r.success && r.data).toEqual({ q: "sept", includeArchived: false });
  });
});
