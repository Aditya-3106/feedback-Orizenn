import { jsonOk, readJson, withApi } from "@/lib/api/response";
import { clientIpFromHeaders, hashRequestIdentifier } from "@/lib/security/rate-limit";
import { submitResponse } from "@/lib/submissions/service";

/** POST /api/public/forms/:slug/submit — untrusted public input (PRD §78). */
export const POST = withApi(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const payload = await readJson(req);
  const requestHash = hashRequestIdentifier(clientIpFromHeaders(req.headers));
  const result = await submitResponse({ slug, payload, requestHash });
  return jsonOk(result, { status: result.duplicate ? 200 : 201 });
});
