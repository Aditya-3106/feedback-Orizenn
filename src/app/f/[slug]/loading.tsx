import { PublicShell } from "@/components/feedback/PublicShell";

export default function Loading() {
  return (
    <PublicShell>
      <div role="status" aria-live="polite" aria-label="Loading form" className="space-y-8">
        <div className="space-y-4">
          <div className="h-10 w-3/4 animate-pulse rounded-md bg-orizenn-border/70" />
          <div className="h-5 w-full animate-pulse rounded-md bg-orizenn-border/50" />
          <div className="h-5 w-2/3 animate-pulse rounded-md bg-orizenn-border/50" />
          <div className="h-3 w-40 animate-pulse rounded-md bg-orizenn-border/50" />
        </div>
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card px-5 py-6 sm:px-8 sm:py-8">
              <div className="h-3 w-16 animate-pulse rounded bg-orizenn-border/60" />
              <div className="mt-4 h-7 w-4/5 animate-pulse rounded-md bg-orizenn-border/60" />
              <div className="mt-6 h-12 w-full animate-pulse rounded-lg bg-orizenn-border/40" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </PublicShell>
  );
}
