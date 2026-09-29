import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/api/errors";
import { assertPermission, type Actor, type Permission } from "@/lib/security/authz";

/** Resolve the current actor from the session, or null. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.role || !user.workspaceId) return null;
  return {
    userId: user.id,
    workspaceId: user.workspaceId,
    role: user.role,
    email: user.email ?? "",
    name: user.name ?? "",
  };
});

/** For Server Actions and Route Handlers: throw a 401 AppError if not signed in. */
export async function requireActor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  if (permission) assertPermission(actor.role, permission);
  return actor;
}

/** For Server Components: redirect to login if not signed in. */
export async function requireActorOrRedirect(nextPath?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
    redirect(target);
  }
  return actor;
}
