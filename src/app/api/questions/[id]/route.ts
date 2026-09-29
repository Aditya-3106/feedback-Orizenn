import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { deleteQuestion, updateQuestion } from "@/lib/questions/service";
import { questionDraftSchema } from "@/lib/validation/question";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor("form:edit");
  const { id } = await params;
  const draft = parseOrThrow(questionDraftSchema, await readJson(req));
  return jsonOk(await updateQuestion(actor, id, draft));
});

export const DELETE = withApi(async (_req: Request, { params }: Ctx) => {
  const actor = await requireActor("form:edit");
  const { id } = await params;
  await deleteQuestion(actor, id);
  return jsonOk(null);
});
