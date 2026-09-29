"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimelineBlock } from "@/lib/analytics/types";
import { formatNumber } from "@/lib/utils/format";

const BLUE = "#0057ff";
const BORDER = "#e4e9ee";
const MUTED = "#4c5c6b";

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }).format(d);
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

interface TooltipPayloadItem {
  value?: number | string;
  payload?: { date: string; count: number };
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<TooltipPayloadItem> }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="card px-3 py-2 text-sm shadow-md">
      <div className="font-medium tabular-nums text-orizenn-ink">
        {formatNumber(point.count)} {point.count === 1 ? "response" : "responses"}
      </div>
      <div className="hint mt-0.5">{longDate(point.date)}</div>
    </div>
  );
}

/**
 * Responses over time (PRD §36). A single-series area: 2px blue line, 10% wash,
 * hairline grid, hover tooltip. The SVG is aria-hidden; the engine's
 * accessibleSummary and a table twin carry the same values for everyone else.
 */
export function TimelineChart({ block, height = 220 }: { block: TimelineBlock; height?: number }) {
  const points = block.points;
  const total = points.reduce((s, p) => s + p.count, 0);
  const peak = points.reduce<{ date: string; count: number } | null>((best, p) => (p.count > (best?.count ?? 0) ? p : best), null);
  const tickInterval = points.length > 14 ? Math.ceil(points.length / 7) - 1 : 0;

  return (
    <section className="card p-5" aria-labelledby="timeline-title">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="timeline-title" className="text-base font-medium text-orizenn-ink">
          {block.title}
        </h3>
        {points.length ? (
          <p className="hint tabular-nums">
            {formatNumber(total)} over {points.length} {points.length === 1 ? "day" : "days"}
            {peak ? ` · peak ${formatNumber(peak.count)} on ${shortDate(peak.date)}` : null}
          </p>
        ) : null}
      </header>
      <p className="sr-only">{block.accessibleSummary}</p>

      {points.length ? (
        <div className="mt-4" aria-hidden="true" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={BORDER} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                interval={tickInterval}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={{ stroke: BORDER }}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<TimelineTooltip />} cursor={{ stroke: MUTED, strokeWidth: 1 }} isAnimationActive={false} />
              <Area
                type="monotone"
                dataKey="count"
                name="Responses"
                stroke={BLUE}
                strokeWidth={2}
                fill={BLUE}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, fill: BLUE, stroke: "#ffffff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 text-sm text-orizenn-muted">No responses yet.</p>
      )}

      {points.length ? (
        <details className="mt-3 border-t border-orizenn-border pt-3">
          <summary className="cursor-pointer select-none text-xs text-orizenn-subtle hover:text-orizenn-ink">Table view</summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="text-right">
                    Responses
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date}>
                    <td>{longDate(p.date)}</td>
                    <td className="text-right tabular-nums">{formatNumber(p.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
