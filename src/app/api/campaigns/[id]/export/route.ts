import { jsonError, parseOrThrow, readJson } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { generateExport } from "@/lib/exports/service";
import { exportRequestSchema } from "@/lib/validation/export";

/**
 * POST /api/campaigns/:id/export — generates the workbook server-side and
 * streams it back as an .xlsx download (PRD §51).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor("export:create");
    const { id } = await params;
    const request = parseOrThrow(exportRequestSchema, await readJson(req));
    const { fileName, buffer, rowCount, exportJobId } = await generateExport(actor, id, request);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.byteLength),
        "X-Export-Rows": String(rowCount),
        "X-Export-Job": exportJobId,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
