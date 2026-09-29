import { ForbiddenError } from "@/lib/api/errors";

export const ROLES = ["SUPER_ADMIN", "ADMIN", "ANALYST"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "campaign:view"
  | "campaign:create"
  | "campaign:edit"
  | "campaign:publish"
  | "campaign:delete"
  | "form:edit"
  | "responses:view"
  | "analytics:view"
  | "export:create"
  | "ai:use"
  | "templates:manage"
  | "students:view"
  | "admins:manage"
  | "settings:manage"
  | "audit:view";

const READ_ONLY: Permission[] = [
  "campaign:view",
  "responses:view",
  "analytics:view",
  "export:create",
  "students:view",
];

const ADMIN: Permission[] = [
  ...READ_ONLY,
  "campaign:create",
  "campaign:edit",
  "campaign:publish",
  "campaign:delete",
  "form:edit",
  "ai:use",
  "templates:manage",
];

const SUPER_ADMIN: Permission[] = [...ADMIN, "admins:manage", "settings:manage", "audit:view"];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(SUPER_ADMIN),
  ADMIN: new Set(ADMIN),
  ANALYST: new Set(READ_ONLY),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError();
  }
}

/** Identity resolved from the session and used by every service call. */
export interface Actor {
  userId: string;
  workspaceId: string;
  role: Role;
  email: string;
  name: string;
}

/** Ensure a workspace-scoped resource belongs to the actor's workspace (IDOR guard, PRD §81). */
export function assertSameWorkspace(actor: Actor, resourceWorkspaceId: string): void {
  if (actor.workspaceId !== resourceWorkspaceId) {
    // Report as not found so cross-tenant probing cannot enumerate ids.
    throw new ForbiddenError("You don't have access to this resource.");
  }
}
