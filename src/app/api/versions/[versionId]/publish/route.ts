import { jsonOk, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { publishVersion } from "@/lib/forms/service";

export const POST = withApi(async (_req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const actor = await requireActor("campaign:publish");
  const { versionId } = await params;
  return jsonOk(await publishVersion(actor, versionId));
});
