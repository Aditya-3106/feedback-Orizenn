/**
 * Shared helpers for DB-backed integration tests.
 *
 * Suites are gated on `enabled` (DATABASE_URL + RUN_DB_TESTS=true). Service and
 * Prisma modules are imported lazily so that simply loading a test file never
 * instantiates the Prisma client when the suite is going to be skipped.
 */
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { isAppError } from "@/lib/api/errors";
import type { Actor, Role } from "@/lib/security/authz";

export const enabled = !!process.env.DATABASE_URL && process.env.RUN_DB_TESTS === "true";

export async function loadModules() {
  const [db, campaigns, forms, questions, submissions, analytics, exportsSvc] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/campaigns/service"),
    import("@/lib/forms/service"),
    import("@/lib/questions/service"),
    import("@/lib/submissions/service"),
    import("@/lib/analytics/load"),
    import("@/lib/exports/service"),
  ]);
  return { prisma: db.prisma, campaigns, forms, questions, submissions, analytics, exportsSvc };
}
export type Modules = Awaited<ReturnType<typeof loadModules>>;

export interface Fixture {
  workspaceId: string;
  otherWorkspaceId: string;
  superAdmin: Actor;
  admin: Actor;
  analyst: Actor;
  /** ADMIN in a different workspace — must never see this workspace's data. */
  outsider: Actor;
  cleanup(): Promise<void>;
}

const suffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create a fresh workspace with SUPER_ADMIN / ADMIN / ANALYST users, plus a
 * second workspace with its own ADMIN. `cleanup()` deletes both workspaces;
 * every campaign, version, question, link, submission, respondent, audit row
 * and export job cascades from there.
 */
export async function createFixture(prisma: PrismaClient, tag: string): Promise<Fixture> {
  const run = `${tag}-${suffix()}`;
  const passwordHash = await bcrypt.hash("Test-password-123", 4);

  const ws = await prisma.workspace.create({ data: { name: `Test ${run}`, slug: `test-${run}` } });
  const other = await prisma.workspace.create({ data: { name: `Other ${run}`, slug: `other-${run}` } });

  async function user(workspaceId: string, role: Role, label: string): Promise<Actor> {
    const u = await prisma.user.create({
      data: { workspaceId, role, name: `${label} ${run}`, email: `${label}-${run}@test.local`, passwordHash },
    });
    return { userId: u.id, workspaceId: u.workspaceId, role: u.role, email: u.email, name: u.name };
  }

  const [superAdmin, admin, analyst, outsider] = await Promise.all([
    user(ws.id, "SUPER_ADMIN", "super"),
    user(ws.id, "ADMIN", "admin"),
    user(ws.id, "ANALYST", "analyst"),
    user(other.id, "ADMIN", "outsider"),
  ]);

  return {
    workspaceId: ws.id,
    otherWorkspaceId: other.id,
    superAdmin,
    admin,
    analyst,
    outsider,
    async cleanup() {
      await prisma.workspace.deleteMany({ where: { id: { in: [ws.id, other.id] } } });
    },
  };
}

/** Assert a promise rejects with an AppError carrying one of the given codes. */
export async function expectAppError(promise: Promise<unknown>, ...codes: string[]): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  if (caught === undefined) throw new Error(`Expected rejection with ${codes.join(" | ")}, but the promise resolved.`);
  if (!isAppError(caught)) throw caught;
  if (!codes.includes(caught.code)) {
    throw new Error(`Expected AppError ${codes.join(" | ")}, got ${caught.code}: ${caught.message}`);
  }
}

export const DRAFT_QUESTIONS = {
  rating: { text: "How useful was Orizenn for your project?", type: "RATING", category: "Value", comparableKey: "usefulness" },
  choice: {
    text: "Did Orizenn show you something you did not already know?",
    type: "SINGLE_CHOICE",
    category: "Discovery",
    options: [{ label: "Yes" }, { label: "No" }, { label: "Not sure" }],
  },
  text: { text: "What, if anything, was confusing?", type: "LONG_TEXT", category: "Friction", required: false },
} as const;
