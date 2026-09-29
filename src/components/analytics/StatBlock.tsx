import type { StatBlock as StatBlockType } from "@/lib/analytics/types";

/** One dashboard metric tile (PRD §36): mono label, display-face value, optional hint. */
export function StatBlock({ block }: { block: StatBlockType }) {
  return (
    <div className="card p-4 md:p-5">
      <div className="mono-label">{block.title}</div>
      <div className="mt-2 font-display text-3xl leading-none text-orizenn-ink">{block.value}</div>
      {block.hint ? <div className="hint mt-1.5">{block.hint}</div> : null}
    </div>
  );
}

export function StatRow({ blocks }: { blocks: StatBlockType[] }) {
  if (!blocks.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" role="list" aria-label="Key metrics">
      {blocks.map((b) => (
        <div key={b.id} role="listitem">
          <StatBlock block={b} />
        </div>
      ))}
    </div>
  );
}
