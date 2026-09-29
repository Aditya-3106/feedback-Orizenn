export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-64 animate-pulse rounded bg-orizenn-border/70" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
      <div className="card h-64 animate-pulse" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
