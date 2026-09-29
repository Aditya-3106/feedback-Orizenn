"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DistributionBucket, RatingDistributionBlock } from "@/lib/analytics/types";
import { formatDecimal, formatNumber } from "@/lib/utils/format";
import { QuestionBlockCard } from "./QuestionBlockCard";

const BLUE = "#0057ff";
/** orizenn-blue at ~35% over the white surface — the de-emphasised bar tint. */
const BLUE_TINT = "#a6c4ff";
const BORDER = "#e4e9ee";
const MUTED = "#4c5c6b";
const INK = "#0a1b2a";

interface TooltipPayloadItem {
  payload?: DistributionBucket;
}

function RatingTooltip({ active, payload, showPercent }: { active?: boolean; payload?: ReadonlyArray<TooltipPayloadItem>; showPercent: boolean }) {
  const b = payload?.[0]?.payload;
  if (!active || !b) return null;
  return (
    <div className="card px-3 py-2 text-sm shadow-md">
      <div className="font-medium tabular-nums text-orizenn-ink">
        {formatNumber(b.count)}
        {showPercent ? ` · ${b.percent}%` : null}
      </div>
      <div className="hint mt-0.5">Selected {b.label}</div>
    </div>
  );
}

interface LabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  index?: number;
}

/**
 * RATING / SCALE distribution (PRD §37): thin columns, the modal value in full
 * blue and the rest in a tint, with the average / median / favourable stats
 * beside the chart and the version comparison badge in the card header.
 */
export function RatingChart({ block, showPercent = true }: { block: RatingDistributionBlock; showPercent?: boolean }) {
  const data = block.distribution;
  const topCount = Math.max(0, ...data.map((d) => d.count));
  const topIndex = topCount > 0 ? data.findIndex((d) => d.count === topCount) : -1;
  const hasData = block.answerCount > 0 && topCount > 0;

  const renderTopLabel = (props: LabelProps) => {
    if (props.index !== topIndex || topIndex < 0) return null;
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
    const y = Number(props.y ?? 0) - 6;
    const b = data[topIndex];
    return (
      <text x={x} y={y} textAnchor="middle" fill={INK} fontSize={11} fontFamily="var(--font-mono)">
        {formatNumber(b.count)}
        {showPercent ? ` · ${b.percent}%` : ""}
      </text>
    );
  };

  return (
    <QuestionBlockCard block={block} showPercent={showPercent}>
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div>
          {hasData ? (
            <div aria-hidden="true" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: -24 }} barCategoryGap="30%">
                  <CartesianGrid stroke={BORDER} strokeWidth={1} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<RatingTooltip showPercent={showPercent} />} cursor={{ fill: "rgba(10, 27, 42, 0.04)" }} isAnimationActive={false} />
                  <Bar dataKey="count" name="Answers" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                    {data.map((d, i) => (
                      <Cell key={d.value} fill={i === topIndex ? BLUE : BLUE_TINT} />
                    ))}
                    <LabelList dataKey="count" content={renderTopLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-orizenn-muted">No answers yet.</p>
          )}
          <p className="hint mt-1 flex justify-between tabular-nums" aria-hidden="true">
            <span>{block.min}</span>
            <span>
              scale {block.min}–{block.max}
            </span>
            <span>{block.max}</span>
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-4 md:grid-cols-1 md:gap-3 md:border-l md:border-orizenn-border md:pl-5">
          <div>
            <dt className="mono-label">Average</dt>
            <dd className="mt-1 font-display text-3xl leading-none text-orizenn-ink">
              {formatDecimal(block.average, 1)}
              <span className="ml-1 font-sans text-xs text-orizenn-subtle">/ {block.max}</span>
            </dd>
          </div>
          <div>
            <dt className="mono-label">Median</dt>
            <dd className="mt-1 font-display text-2xl leading-none text-orizenn-ink">{block.median == null ? "—" : block.median}</dd>
          </div>
          {block.kind === "RATING_DISTRIBUTION" && showPercent ? (
            <div>
              <dt className="mono-label">Favourable</dt>
              <dd className="mt-1 font-display text-2xl leading-none text-orizenn-ink">
                {block.favourablePercent == null ? "—" : `${block.favourablePercent}%`}
              </dd>
              <dd className="hint mt-0.5">
                rated {block.max - 1} or {block.max}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {hasData ? (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs text-orizenn-subtle hover:text-orizenn-ink">Table view</summary>
          <table className="table mt-2">
            <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col" className="text-right">
                  Answers
                </th>
                {showPercent ? (
                  <th scope="col" className="text-right">
                    Share
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.value}>
                  <td>{d.label}</td>
                  <td className="text-right tabular-nums">{formatNumber(d.count)}</td>
                  {showPercent ? <td className="text-right tabular-nums">{d.percent}%</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </QuestionBlockCard>
  );
}
