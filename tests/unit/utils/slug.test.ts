import { describe, expect, it } from "vitest";
import {
  SLUG_PATTERN,
  generateCampaignSlug,
  generateLinkSlug,
  generateQuestionKey,
  isValidSlug,
  randomSuffix,
  slugify,
} from "@/lib/utils/slug";

const SAFE_ALPHABET = /^[23456789abcdefghjkmnpqrstuvwxyz]+$/;

describe("slugify", () => {
  it("lowercases and strips invalid characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  Student  Feedback — September 2026 ")).toBe("student-feedback-september-2026");
    expect(slugify("a_b.c/d")).toBe("a-b-c-d");
  });

  it("removes accents", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume");
  });

  it("truncates to maxLength without leaving a trailing dash", () => {
    expect(slugify("abcdef ghijkl", 7)).toBe("abcdef");
    expect(slugify("abcdef ghijkl", 6)).toBe("abcdef");
    expect(slugify("x".repeat(100)).length).toBe(48);
  });

  it("falls back to 'form' when nothing is left", () => {
    expect(slugify("!!!")).toBe("form");
    expect(slugify("")).toBe("form");
    expect(slugify("日本語")).toBe("form");
  });
});

describe("randomSuffix", () => {
  it("uses the look-alike-free alphabet and the requested length", () => {
    expect(randomSuffix()).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect(randomSuffix(4)).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);
    expect(randomSuffix(10)).toHaveLength(10);
  });
});

describe("generateLinkSlug (PRD §25)", () => {
  it("is a readable prefix plus a 6-char random suffix", () => {
    const slug = generateLinkSlug("Student September 2026");
    expect(slug).toMatch(/^student-september-2026-[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("is unique across many generations", () => {
    const slugs = new Set(Array.from({ length: 200 }, () => generateLinkSlug("Same name")));
    expect(slugs.size).toBe(200);
  });

  it("strips invalid characters from the name", () => {
    const slug = generateLinkSlug("Q&A: Batch #3 (Pune)!");
    expect(slug.startsWith("q-a-batch-3-pune-")).toBe(true);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("caps the readable prefix at 40 characters", () => {
    const slug = generateLinkSlug("x".repeat(80));
    expect(slug).toBe(`${"x".repeat(40)}-${slug.slice(-6)}`);
    expect(slug.slice(-6)).toMatch(SAFE_ALPHABET);
  });
});

describe("generateCampaignSlug", () => {
  it("uses a 4-char suffix", () => {
    expect(generateCampaignSlug("My Campaign")).toMatch(/^my-campaign-[23456789abcdefghjkmnpqrstuvwxyz]{4}$/);
  });
});

describe("generateQuestionKey", () => {
  it("derives a stable snake_case key from the text", () => {
    expect(generateQuestionKey("How useful was Orizenn?")).toBe("q_how_useful_was_orizenn");
    expect(generateQuestionKey("  Did it help?!  ")).toBe("q_did_it_help");
  });

  it("handles collisions with the existing keys by appending a counter", () => {
    const existing = ["q_how_useful_was_orizenn"];
    expect(generateQuestionKey("How useful was Orizenn?", existing)).toBe("q_how_useful_was_orizenn_2");
    existing.push("q_how_useful_was_orizenn_2");
    expect(generateQuestionKey("How useful was Orizenn?", existing)).toBe("q_how_useful_was_orizenn_3");
    expect(generateQuestionKey("How useful was Orizenn?", new Set(existing))).toBe("q_how_useful_was_orizenn_3");
  });

  it("does not collide when the existing set is unrelated", () => {
    expect(generateQuestionKey("New question", ["q_other"])).toBe("q_new_question");
  });

  it("falls back to q_form for symbol-only text", () => {
    expect(generateQuestionKey("???")).toBe("q_form");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase kebab-case between 3 and 80 chars", () => {
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("student-sept-2026-a8f3kq")).toBe(true);
    expect(isValidSlug("a".repeat(80))).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a".repeat(81))).toBe(false);
    expect(isValidSlug("Abc")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("a_b")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
    expect(SLUG_PATTERN.test("with space")).toBe(false);
  });
});
