"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const redirectTo = next.startsWith("/admin") ? next : "/admin";

  if (!email || !password) return { error: "Enter your email and password." };

  try {
    await signIn("credentials", { email, password, redirectTo });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "That email and password combination didn't work." };
    }
    // signIn throws a redirect on success; let Next.js handle it.
    throw err;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect("/login");
}
