import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { reorderQuestions } from "@/lib/questions/service";
import { reorderSchema } from "@/lib/validation/question";

export const POST = withApi(async (req: Request) => {
  const actor = await requireActor("form:edit");
  const { formVersionId, orderedIds } = parseOrThrow(reorderSchema, await readJson(req));
  await reorderQuestions(actor, formVersionId, orderedIds);
  return jsonOk(null);
});
