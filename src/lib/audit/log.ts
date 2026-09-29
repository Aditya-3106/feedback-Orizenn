import type { Prisma } from "@/generated/prisma/client";
import type { DbOrTx } from "@/lib/db/client";
import type { Actor } from "@/lib/security/authz";

export type AuditAction =
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_UPDATED"
  | "CAMPAIGN_STATUS_CHANGED"
  | "CAMPAIGN_DUPLICATED"
  | "CAMPAIGN_DELETED"
  | "FORM_VERSION_CREATED"
  | "FORM_VERSION_CLONED"
  | "QUESTION_ADDED"
  | "QUESTION_EDITED"
  | "QUESTION_DELETED"
  | "QUESTIONS_REORDERED"
  | "FORM_PUBLISHED"
  | "FORM_DEACTIVATED"
  | "LINK_STATUS_CHANGED"
  | "EXPORT_GENERATED"
  | "AI_QUESTIONS_GENERATED"
  | "AI_INSIGHTS_GENERATED"
  | "TEMPLATE_CREATED"
  | "TEMPLATE_UPDATED"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED";

export interface AuditEntry {
  action: AuditAction;
  entityType: "Campaign" | "FormVersion" | "Question" | "FeedbackLink" | "ExportJob" | "AIJob" | "FormTemplate" | "User";
  entityId: string;
  metadata?: Record<string, unknown>;
}

/** Write an audit row. Accepts a transaction client so it commits with the mutation. */
export async function audit(db: DbOrTx, actor: Actor, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadataJson: (entry.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}

/** Structured log line (PRD §119). Never include raw feedback or secrets. */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
  if (process.env.NODE_ENV === "test") return;
  console.log(line);
}
