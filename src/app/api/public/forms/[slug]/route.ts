import { jsonOk, withApi } from "@/lib/api/response";
import { getPublicForm } from "@/lib/forms/service";

/** GET /api/public/forms/:slug — published form definition for the student UI. */
export const GET = withApi(async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { form } = await getPublicForm(slug);
  return jsonOk(form, { headers: { "Cache-Control": "no-store" } });
});
