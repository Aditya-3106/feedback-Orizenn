import type { ResponseMode } from "@/lib/forms/definitions";

export interface RespondentLike {
  id: string;
  name: string | null;
  email: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  projectType: string | null;
}

export interface PresentedRespondent {
  /** Display label, e.g. a name, a pseudonym or "Anonymous". */
  label: string;
  email: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  projectType: string | null;
  identityShown: boolean;
}

/**
 * Apply the campaign's response mode at the data-access layer (PRD §84).
 * Identity is only surfaced for IDENTIFIED campaigns. Pseudonymous campaigns
 * expose segment fields plus a stable pseudonym; anonymous campaigns expose
 * segment fields only.
 */
export function presentRespondent(
  mode: ResponseMode,
  respondent: RespondentLike | null,
  index?: number,
): PresentedRespondent {
  const segments = {
    college: respondent?.college ?? null,
    branch: respondent?.branch ?? null,
    year: respondent?.year ?? null,
    projectType: respondent?.projectType ?? null,
  };

  if (mode === "IDENTIFIED" && respondent) {
    return {
      label: respondent.name?.trim() || respondent.email || pseudonym(respondent.id, index),
      email: respondent.email,
      identityShown: true,
      ...segments,
    };
  }

  if (mode === "PSEUDONYMOUS" && respondent) {
    return { label: pseudonym(respondent.id, index), email: null, identityShown: false, ...segments };
  }

  return { label: index != null ? `Respondent ${pad(index + 1)}` : "Anonymous", email: null, identityShown: false, ...segments };
}

function pseudonym(id: string, index?: number): string {
  if (index != null) return `Student ${pad(index + 1)}`;
  return `Student ${id.slice(-4).toUpperCase()}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Strip identity when storing a respondent for a non-identified campaign. */
export function sanitizeRespondentInput<T extends { name?: string; email?: string }>(
  mode: ResponseMode,
  input: T,
): T {
  if (mode === "ANONYMOUS") {
    const copy = { ...input };
    delete copy.name;
    delete copy.email;
    return copy;
  }
  return input;
}
