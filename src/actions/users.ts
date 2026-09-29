"use server";

import { revalidatePath } from "next/cache";
import { fail, runAction, type ActionResult, type FieldErrors } from "@/lib/api/errors";
import { parseOrThrow } from "@/lib/api/response";
import { requireActor } from "@/lib/auth/session";
import { ROLES } from "@/lib/security/authz";
import { createUser, createUserSchema, setUserRole } from "@/lib/workspace/service";
import { z } from "zod";

export interface UserFormState {
  error?: string;
  fields?: FieldErrors;
  created?: { name: string; email: string };
}

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  try {
    const actor = await requireActor("admins:manage");
    const input = parseOrThrow(createUserSchema, {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
    });
    const user = await createUser(actor, input);
    revalidatePath("/admin/settings");
    return { created: { name: user.name, email: user.email } };
  } catch (err) {
    const r = fail(err);
    return r.success ? {} : { error: r.error.message, fields: r.error.fields };
  }
}

export async function setUserRoleAction(userId: string, role: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const actor = await requireActor("admins:manage");
    await setUserRole(actor, userId, parseOrThrow(z.enum(ROLES), role));
    return null;
  });
  revalidatePath("/admin/settings");
  return result;
}
