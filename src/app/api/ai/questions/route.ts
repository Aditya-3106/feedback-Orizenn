import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { generateQuestionSuggestions } from "@/lib/ai/service";
import { requireActor } from "@/lib/auth/session";
import { z } from "zod";

const bodySchema = z.object({
  versionId: z.string().min(1),
  goal: z.string().trim().min(10, "Describe what you want to learn in at least 10 characters.").max(1000),
  count: z.coerce.number().int().min(3).max(8).default(6),
});

/** POST /api/ai/questions — structured, validated suggestions; nothing is inserted (PRD §19, §91). */
export const POST = withApi(async (req: Request) => {
  const actor = await requireActor("ai:use");
  const { versionId, goal, count } = parseOrThrow(bodySchema, await readJson(req));
  const result = await generateQuestionSuggestions(actor, versionId, goal, count);
  return jsonOk(result);
});
