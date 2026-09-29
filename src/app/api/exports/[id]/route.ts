import { NotFoundError } from "@/lib/api/errors";
import { jsonOk, withApi } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { assertSameWorkspace } from "@/lib/security/authz";

/** GET /api/exports/:id — status of an export job (files are streamed on creation, not stored). */
export const GET = withApi(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("export:create");
  const { id } = await params;
  const job = await prisma.exportJob.findUnique({
    where: { id },
    include: { campaign: { select: { workspaceId: true, name: true } } },
  });
  if (!job) throw new NotFoundError("Export");
  assertSameWorkspace(actor, job.campaign.workspaceId);
  return jsonOk({
    id: job.id,
    type: job.type,
    status: job.status,
    fileName: job.fileName,
    campaign: job.campaign.name,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.errorMessage,
  });
});
