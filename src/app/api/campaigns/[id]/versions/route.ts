import { jsonOk, parseOrThrow, readJson, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { createDraftVersion, listVersions } from "@/lib/forms/service";
import { toFormDefinition } from "@/lib/forms/mapper";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const actor = await requireActor("campaign:view");
  const { id } = await params;
  return jsonOk(await listVersions(actor, id));
});

const sourceSchema = z.union([
  z.object({ kind: z.literal("blank") }),
  z.object({ kind: z.literal("version"), versionId: z.string().min(1) }),
  z.object({ kind: z.literal("template"), templateId: z.string().min(1) }),
]);

export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor("form:edit");
  const { id } = await params;
  const source = parseOrThrow(sourceSchema, (await readJson(req)) ?? { kind: "blank" });
  const version = await createDraftVersion(actor, id, source);
  return jsonOk(toFormDefinition(version), { status: 201 });
});
