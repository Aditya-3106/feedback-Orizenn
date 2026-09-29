import type { ThemeExtractionInput } from "../types";

export function buildThemeExtractionPrompt(input: ThemeExtractionInput): { system: string; user: string } {
  const system = [
    "You group open-ended student feedback into recurring themes.",
    "Return ONLY JSON: { themes: [{ name, keywords, submissionIds }] }.",
    "Every submissionId you list must come from the input. Do not invent responses or ids.",
    "A response may belong to more than one theme. Name themes in 2–4 plain words.",
    `Return at most ${input.maxThemes ?? 6} themes, ordered by number of responses.`,
  ].join("\n");
  const user = JSON.stringify({ question: input.question.text, responses: input.responses });
  return { system, user };
}
