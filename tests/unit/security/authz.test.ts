import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/api/errors";
import { ROLES, assertPermission, assertSameWorkspace, can, type Actor, type Permission, type Role } from "@/lib/security/authz";

const ALL_PERMISSIONS: Permission[] = [
  "campaign:view",
  "campaign:create",
  "campaign:edit",
  "campaign:publish",
  "campaign:delete",
  "form:edit",
  "responses:view",
  "analytics:view",
  "export:create",
  "ai:use",
  "templates:manage",
  "students:view",
  "admins:manage",
  "settings:manage",
  "audit:view",
];

const SUPER_ONLY: Permission[] = ["admins:manage", "settings:manage", "audit:view"];
const ANALYST_READ_ONLY: Permission[] = ["campaign:view", "responses:view", "analytics:view", "export:create", "students:view"];

describe("role permission matrix (PRD §111)", () => {
  it("SUPER_ADMIN can do everything", () => {
    for (const p of ALL_PERMISSIONS) expect(can("SUPER_ADMIN", p)).toBe(true);
  });

  it("ADMIN can do everything except admins:manage, settings:manage and audit:view", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can("ADMIN", p)).toBe(!SUPER_ONLY.includes(p));
    }
  });

  it("ANALYST is read-only", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can("ANALYST", p)).toBe(ANALYST_READ_ONLY.includes(p));
    }
    expect(can("ANALYST", "campaign:create")).toBe(false);
    expect(can("ANALYST", "form:edit")).toBe(false);
    expect(can("ANALYST", "campaign:publish")).toBe(false);
    expect(can("ANALYST", "export:create")).toBe(true);
  });

  it("unknown roles have no permissions", () => {
    expect(can("GUEST" as Role, "campaign:view")).toBe(false);
  });

  it("exposes the three roles", () => {
    expect(ROLES).toEqual(["SUPER_ADMIN", "ADMIN", "ANALYST"]);
  });
});

describe("assertPermission", () => {
  it("passes silently when allowed", () => {
    expect(() => assertPermission("ANALYST", "analytics:view")).not.toThrow();
  });

  it("throws ForbiddenError (403) when denied", () => {
    expect(() => assertPermission("ANALYST", "campaign:create")).toThrow(ForbiddenError);
    try {
      assertPermission("ADMIN", "audit:view");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).code).toBe("FORBIDDEN");
      expect((err as ForbiddenError).status).toBe(403);
    }
  });
});

describe("assertSameWorkspace (IDOR guard, PRD §81)", () => {
  const actor: Actor = { userId: "u1", workspaceId: "ws_a", role: "ADMIN", email: "a@example.com", name: "A" };

  it("allows resources in the actor's workspace", () => {
    expect(() => assertSameWorkspace(actor, "ws_a")).not.toThrow();
  });

  it("throws ForbiddenError on a mismatch, without leaking the other workspace id", () => {
    expect(() => assertSameWorkspace(actor, "ws_b")).toThrow(ForbiddenError);
    try {
      assertSameWorkspace(actor, "ws_b");
    } catch (err) {
      expect((err as Error).message).not.toContain("ws_b");
    }
  });
});
