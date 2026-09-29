import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { audit } from "@/lib/audit/log";
import { ROLES, assertPermission, type Actor } from "@/lib/security/authz";

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(ROLES),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export async function getWorkspace(actor: Actor) {
  const ws = await prisma.workspace.findUnique({ where: { id: actor.workspaceId } });
  if (!ws) throw new NotFoundError("Workspace");
  return ws;
}

export async function listUsers(actor: Actor) {
  assertPermission(actor.role, "admins:manage");
  return prisma.user.findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  assertPermission(actor.role, "admins:manage");
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("A user with that email already exists.");
  const passwordHash = await hash(input.password, 12);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { workspaceId: actor.workspaceId, name: input.name, email: input.email, role: input.role, passwordHash },
      select: { id: true, name: true, email: true, role: true },
    });
    await audit(tx, actor, { action: "USER_CREATED", entityType: "User", entityId: user.id, metadata: { role: user.role } });
    return user;
  });
}

export async function setUserRole(actor: Actor, userId: string, role: (typeof ROLES)[number]) {
  assertPermission(actor.role, "admins:manage");
  if (userId === actor.userId) throw new ValidationError({ role: ["You cannot change your own role."] });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.workspaceId !== actor.workspaceId) throw new NotFoundError("User");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: user.id }, data: { role }, select: { id: true, role: true } });
    await audit(tx, actor, { action: "USER_ROLE_CHANGED", entityType: "User", entityId: user.id, metadata: { from: user.role, to: role } });
    return updated;
  });
}

export async function listAuditLog(actor: Actor, limit = 50) {
  assertPermission(actor.role, "audit:view");
  return prisma.auditLog.findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true } } },
  });
}
