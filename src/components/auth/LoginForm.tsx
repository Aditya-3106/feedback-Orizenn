"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/actions/auth";
import { SubmitButton } from "@/components/ui/client";
import { FieldError } from "@/components/ui/primitives";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input mt-1" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} className="input mt-1" />
      </div>
      <FieldError id="login-error" errors={state.error} />
      <SubmitButton className="btn-primary w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
