import Link from "next/link";
import { Wordmark } from "@/components/ui/primitives";
import { getActor } from "@/lib/auth/session";

export default async function MarketingPage() {
  const actor = await getActor();
  return (
    <div className="min-h-screen bg-orizenn-bg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark />
        <Link href={actor ? "/admin" : "/login"} className="btn-secondary btn-sm">
          {actor ? "Open admin" : "Sign in"}
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10 md:pt-20">
        <div className="mono-label mb-4">Feedback Intelligence</div>
        <h1 className="font-display text-5xl leading-[1.05] text-orizenn-ink md:text-7xl">
          Understand what students are <em className="italic text-orizenn-blue">actually</em> telling you.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-orizenn-muted">
          Create a feedback campaign, reuse or generate the questions, share one link, and get a dashboard built
          around the questions you asked. Evidence first, interpretation second, and every number traceable to
          real responses.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={actor ? "/admin/campaigns/new" : "/login"} className="btn-primary">
            Create a campaign
          </Link>
          <Link href={actor ? "/admin" : "/login"} className="btn-secondary">
            {actor ? "Go to dashboard" : "Sign in"}
          </Link>
        </div>

        <ol className="mt-20 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-orizenn-border bg-orizenn-border md:grid-cols-5">
          {[
            ["01", "Create", "Name the campaign and what you want to learn."],
            ["02", "Compose", "Reuse a previous form, start fresh, or ask AI."],
            ["03", "Publish", "Immutable versions and a unique shareable link."],
            ["04", "Understand", "A dashboard generated from your question metadata."],
            ["05", "Export", "The exact filtered dataset as an Excel workbook."],
          ].map(([n, title, body]) => (
            <li key={n} className="bg-orizenn-surface p-5">
              <div className="font-mono text-xs text-orizenn-subtle">{n}</div>
              <div className="mt-2 font-display text-2xl text-orizenn-ink">{title}</div>
              <p className="mt-1 text-sm text-orizenn-muted">{body}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
