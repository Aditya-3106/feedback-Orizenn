import { customAlphabet } from "nanoid";

/** Lowercase alphanumerics without look-alikes; URL safe and non-sequential. */
const suffixAlphabet = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 6);

/** Turn free text into a URL-safe slug body. */
export function slugify(input: string, maxLength = 48): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return base || "form";
}

/** Random suffix of the given length (default 6) from the safe alphabet. */
export function randomSuffix(length = 6): string {
  return length === 6 ? suffixAlphabet() : customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", length)();
}

/**
 * Public feedback link slug (PRD §25): readable prefix + random suffix.
 * e.g. `student-september-2026-a8f3kq`. Never derived from a database id.
 */
export function generateLinkSlug(name: string): string {
  return `${slugify(name, 40)}-${randomSuffix(6)}`;
}

/** Internal campaign slug; unique per workspace. */
export function generateCampaignSlug(name: string): string {
  return `${slugify(name, 40)}-${randomSuffix(4)}`;
}

/** Stable question key from text, e.g. `q_how_useful_was_orizenn`. */
export function generateQuestionKey(text: string, existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  const base = `q_${slugify(text, 40).replace(/-/g, "_")}`;
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length >= 3 && slug.length <= 80;
}
