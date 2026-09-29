import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { addQuestion } from "@/lib/questions/service";
import { questionDraftSchema } from "@/lib/validation/question";

export const POST = withApi(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const actor = await requireActor("form:edit");
  const { versionId } = await params;
  const draft = parseOrThrow(questionDraftSchema, await readJson(req));
  return jsonOk(await addQuestion(actor, versionId, draft), { status: 201 });
});
