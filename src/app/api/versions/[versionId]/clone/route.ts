import { jsonOk, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { createDraftVersion, getVersionForActor } from "@/lib/forms/service";
import { toFormDefinition } from "@/lib/forms/mapper";

/** POST /api/versions/:versionId/clone — new draft in the same campaign from this version. */
export const POST = withApi(async (_req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const actor = await requireActor("form:edit");
  const { versionId } = await params;
  const source = await getVersionForActor(actor, versionId);
  const draft = await createDraftVersion(actor, source.campaignId, { kind: "version", versionId });
  return jsonOk(toFormDefinition(draft), { status: 201 });
});
