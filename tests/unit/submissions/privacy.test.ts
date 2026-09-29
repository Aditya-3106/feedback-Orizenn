import { describe, expect, it } from "vitest";
import { presentRespondent, sanitizeRespondentInput, type RespondentLike } from "@/lib/submissions/privacy";

const respondent: RespondentLike = {
  id: "clx9respondent1abcd",
  name: "Asha Rao",
  email: "asha@example.com",
  college: "IIT Bombay",
  branch: "CSE",
  year: "3",
  projectType: "Web app",
};

describe("presentRespondent (PRD §84)", () => {
  it("IDENTIFIED shows name and email", () => {
    expect(presentRespondent("IDENTIFIED", respondent)).toEqual({
      label: "Asha Rao",
      email: "asha@example.com",
      identityShown: true,
      college: "IIT Bombay",
      branch: "CSE",
      year: "3",
      projectType: "Web app",
    });
  });

  it("IDENTIFIED falls back to email, then to a pseudonym when the name is blank", () => {
    expect(presentRespondent("IDENTIFIED", { ...respondent, name: "  " }).label).toBe("asha@example.com");
    expect(presentRespondent("IDENTIFIED", { ...respondent, name: null, email: null }, 0).label).toBe("Student 01");
    expect(presentRespondent("IDENTIFIED", { ...respondent, name: null, email: null }).label).toBe("Student ABCD");
  });

  it("PSEUDONYMOUS hides name and email but keeps segment fields", () => {
    const p = presentRespondent("PSEUDONYMOUS", respondent, 0);
    expect(p.label).toBe("Student 01");
    expect(p.email).toBeNull();
    expect(p.identityShown).toBe(false);
    expect(p).toMatchObject({ college: "IIT Bombay", branch: "CSE", year: "3", projectType: "Web app" });
    expect(JSON.stringify(p)).not.toContain("Asha");
    expect(JSON.stringify(p)).not.toContain("asha@example.com");
  });

  it("PSEUDONYMOUS uses a stable id-derived pseudonym without an index and a padded ordinal with one", () => {
    expect(presentRespondent("PSEUDONYMOUS", respondent).label).toBe("Student ABCD");
    expect(presentRespondent("PSEUDONYMOUS", respondent, 9).label).toBe("Student 10");
    expect(presentRespondent("PSEUDONYMOUS", respondent, 99).label).toBe("Student 100");
  });

  it("ANONYMOUS hides identity and uses a generic label", () => {
    const p = presentRespondent("ANONYMOUS", respondent);
    expect(p.label).toBe("Anonymous");
    expect(p.email).toBeNull();
    expect(p.identityShown).toBe(false);
    expect(p.college).toBe("IIT Bombay");
    expect(presentRespondent("ANONYMOUS", respondent, 2).label).toBe("Respondent 03");
    expect(JSON.stringify(p)).not.toMatch(/Asha|asha@/);
  });

  it("handles a missing respondent in every mode", () => {
    for (const mode of ["IDENTIFIED", "PSEUDONYMOUS", "ANONYMOUS"] as const) {
      const p = presentRespondent(mode, null);
      expect(p).toEqual({ label: "Anonymous", email: null, identityShown: false, college: null, branch: null, year: null, projectType: null });
    }
    expect(presentRespondent("IDENTIFIED", null, 4).label).toBe("Respondent 05");
  });
});

describe("sanitizeRespondentInput (PRD §84)", () => {
  const input = { name: "Asha", email: "asha@example.com", college: "IIT", year: "3" };

  it("strips name and email for ANONYMOUS campaigns without mutating the input", () => {
    const out = sanitizeRespondentInput("ANONYMOUS", input);
    expect(out).toEqual({ college: "IIT", year: "3" });
    expect(out).not.toHaveProperty("name");
    expect(out).not.toHaveProperty("email");
    expect(input).toEqual({ name: "Asha", email: "asha@example.com", college: "IIT", year: "3" });
  });

  it("keeps identity for PSEUDONYMOUS (hidden at presentation time) and IDENTIFIED", () => {
    expect(sanitizeRespondentInput("PSEUDONYMOUS", input)).toBe(input);
    expect(sanitizeRespondentInput("IDENTIFIED", input)).toBe(input);
  });
});
