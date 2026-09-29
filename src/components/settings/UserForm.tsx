"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { createUserAction, setUserRoleAction, type UserFormState } from "@/actions/users";
import { Flash, SubmitButton, useFlash } from "@/components/ui/client";
import { FieldError, Notice } from "@/components/ui/primitives";
import { ROLES } from "@/lib/security/authz";

export function UserForm() {
  const [state, action] = useActionState<UserFormState, FormData>(createUserAction, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.created ? (
        <Notice tone="success" title="User created.">
          {state.created.name} ({state.created.email}) can sign in with the password you set. Ask them to change it.
        </Notice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="u-name" className="label">
            Name
          </label>
          <input id="u-name" name="name" className={`input mt-1 ${f.name ? "input-error" : ""}`} required />
          <FieldError errors={f.name} />
        </div>
        <div>
          <label htmlFor="u-email" className="label">
            Email
          </label>
          <input id="u-email" name="email" type="email" className={`input mt-1 ${f.email ? "input-error" : ""}`} required />
          <FieldError errors={f.email} />
        </div>
        <div>
          <label htmlFor="u-role" className="label">
            Role
          </label>
          <select id="u-role" name="role" className="input mt-1" defaultValue="ADMIN">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
          <FieldError errors={f.role} />
        </div>
        <div>
          <label htmlFor="u-password" className="label">
            Temporary password
          </label>
          <input id="u-password" name="password" type="password" autoComplete="new-password" minLength={10} className={`input mt-1 ${f.password ? "input-error" : ""}`} required />
          <FieldError errors={f.password} />
        </div>
      </div>
      <SubmitButton pendingText="Creating…">Add user</SubmitButton>
    </form>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const router = useRouter();
  const { message, flash } = useFlash();
  return (
    <>
      <Flash message={message} />
      <select
        aria-label="Role"
        className="input py-1 text-xs"
        defaultValue={role}
        disabled={disabled}
        onChange={async (e) => {
          const r = await setUserRoleAction(userId, e.target.value);
          if (r.success) {
            flash({ tone: "success", text: "Role updated." });
            router.refresh();
          } else {
            flash({ tone: "danger", text: r.error.message });
            e.target.value = role;
          }
        }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace("_", " ")}
          </option>
        ))}
      </select>
    </>
  );
}
