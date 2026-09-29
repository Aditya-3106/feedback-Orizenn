import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { Wordmark } from "@/components/ui/primitives";
import { getActor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  const { next } = await searchParams;
  if (actor) redirect(next?.startsWith("/admin") ? next : "/admin");

  return (
    <div className="flex min-h-screen flex-col bg-orizenn-bg">
      <header className="px-6 py-6">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="card w-full max-w-sm p-6 rise-in">
          <div className="mono-label">Admin</div>
          <h1 className="mt-2 font-display text-3xl text-orizenn-ink">Sign in</h1>
          <p className="mt-1 text-sm text-orizenn-muted">Use your Orizenn workspace credentials.</p>
          <div className="mt-6">
            <LoginForm next={next} />
          </div>
        </div>
      </main>
    </div>
  );
}
