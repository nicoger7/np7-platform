"use client";

import { useState } from "react";
import { MONTHS, type Pnl } from "@/lib/finance/board";
import type { CostObjectNode } from "@/lib/finance/objects";

/**
 * The finance dashboard's charts.
 *
 * One colour means one thing across every chart here: revenue is always blue,
 * stock always aqua, funding always green. The cash line is deliberately NOT
 * one of the series colours, because it is a derived position rather than a
 * kind of money, and giving it a series hue would imply it belonged in the
 * legend beside them.
 *
 * Palette validated against both admin surfaces (#ffffff / #14161b): every
 * adjacent pair clears the CVD and normal-vision floors. Three light-mode hues
 * sit under 3:1 against white, so the relief rule applies and every series
 * carries a visible label, with the Grid tab standing as the table view.
 */

const eur0 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

export const VIZ_CSS = `
.viz { --s-revenue:#2a78d6; --s-cogs:#eb6834; --s-inventory:#1baf7a;
       --s-opex:#eda100; --s-development:#e87ba4; --s-funding:#008300;
       --viz-line:#0b0b0b; --viz-grid:#e4e3df; --viz-neg:#e34948; --viz-neg-band:#fbeaea; }
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz {
    --s-revenue:#3987e5; --s-cogs:#d95926; --s-inventory:#199e70;
    --s-opex:#c98500; --s-development:#d55181; --s-funding:#008300;
    --viz-line:#f2f2f0; --viz-grid:#2b2f37; --viz-neg:#e66767; --viz-neg-band:#3a1f1f;
  }
}
:root[data-theme="dark"] .viz {
  --s-revenue:#3987e5; --s-cogs:#d95926; --s-inventory:#199e70;
  --s-opex:#c98500; --s-development:#d55181; --s-funding:#008300;
  --viz-line:#f2f2f0; --viz-grid:#2b2f37; --viz-neg:#e66767; --viz-neg-band:#3a1f1f;
}
.viz text { fill: var(--admin-text-muted); font-variant-numeric: tabular-nums; }
.viz .viz-strong { fill: var(--admin-text); }
`;

const SERIES = [
  { key: "revenue", label: "Revenue", varName: "--s-revenue" },
  { key: "funding", label: "Funding", varName: "--s-funding" },
  { key: "cogs", label: "Cost of goods", varName: "--s-cogs" },
  { key: "inventory", label: "Stock bought", varName: "--s-inventory" },
  { key: "opex", label: "Operating", varName: "--s-opex" },
  { key: "development", label: "Development", varName: "--s-development" },
] as const;

function Legend({ keys }: { keys: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
      {SERIES.filter((s) => keys.includes(s.key)).map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] admin-muted">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: `var(${s.varName})` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Frame({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="admin-card border rounded-xl p-4 viz">
      <h3 className="text-sm font-bold admin-heading">{title}</h3>
      {subtitle && <p className="text-[11px] admin-faint mb-2">{subtitle}</p>}
      {children}
      {footer}
    </div>
  );
}

/* ── 1. Cash position ─────────────────────────────────────────────────────── */

export function CashChart({ pnl, opening }: { pnl: Pnl; opening: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, L = 64, R = 16, T = 16, B = 28;
  const pts = pnl.accumulated;
  const lo = Math.min(0, ...pts, opening);
  const hi = Math.max(0, ...pts, opening);
  const span = hi - lo || 1;
  const x = (i: number) => L + (i * (W - L - R)) / 11;
  const y = (v: number) => T + (hi - v) * (H - T - B) / span;
  const zeroY = y(0);

  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const area = `${path} L${x(11)},${zeroY} L${x(0)},${zeroY} Z`;
  const lowIdx = pts.indexOf(pnl.lowestPoint);
  const ticks = [hi, hi - span / 2, lo].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Frame title="Cash position"
           subtitle={`Closing balance each month${opening !== 0 ? `, opening at ${eur0(opening)}` : ""}. The low point is what the year needs funding for.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
           aria-label={`Cash position by month. Lowest ${eur2(pnl.lowestPoint)}, closing ${eur2(pts[11] ?? 0)}.`}>
        {/* months where the balance is under water */}
        {pts.map((v, i) => v < 0 ? (
          <rect key={i} x={x(i) - (W - L - R) / 22} y={T} width={(W - L - R) / 11} height={H - T - B}
                fill="var(--viz-neg-band)" />
        ) : null)}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth="1" />
            <text x={L - 8} y={y(v) + 3} textAnchor="end" fontSize="10">{eur0(v)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={zeroY} y2={zeroY} stroke="var(--viz-line)" strokeWidth="1.5" opacity="0.45" />
        <path d={area} fill="var(--s-revenue)" opacity="0.07" />
        <path d={path} fill="none" stroke="var(--viz-line)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5}
                  fill={v < 0 ? "var(--viz-neg)" : "var(--viz-line)"}
                  stroke="var(--admin-surface)" strokeWidth="2" />
        ))}
        {lowIdx >= 0 && (
          <text x={x(lowIdx)} y={y(pts[lowIdx]) + (pts[lowIdx] < 0 ? 20 : -12)} textAnchor="middle"
                fontSize="10" className="viz-strong" fontWeight="700">
            low {eur0(pnl.lowestPoint)}
          </text>
        )}
        {MONTHS.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10">{m}</text>
        ))}
        {/* hit targets wider than the marks */}
        {MONTHS.map((_, i) => (
          <rect key={i} x={x(i) - (W - L - R) / 22} y={T} width={(W - L - R) / 11} height={H - T - B}
                fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <p className="text-[11px] admin-muted mt-1">
          <span className="font-semibold admin-heading">{MONTHS[hover]}</span>
          {" · closing "}<span className="font-semibold admin-heading">{eur2(pts[hover])}</span>
          {" · moved "}{eur2(pnl.cashMovement.byMonth[hover])}
        </p>
      )}
    </Frame>
  );
}

/* ── 2. Money in and out ──────────────────────────────────────────────────── */

export function FlowChart({ pnl }: { pnl: Pnl }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 260, L = 64, R = 16, T = 16, B = 28;
  const ins = MONTHS.map((_, i) => [
    { key: "revenue", v: pnl.revenue.byMonth[i] },
    { key: "funding", v: pnl.financing.byMonth[i] },
  ]);
  const outs = MONTHS.map((_, i) => [
    { key: "cogs", v: pnl.cogs.byMonth[i] },
    { key: "inventory", v: pnl.inventory.byMonth[i] },
    { key: "opex", v: pnl.opex.byMonth[i] },
    { key: "development", v: pnl.development.byMonth[i] },
  ]);
  const maxIn = Math.max(1, ...ins.map((s) => s.reduce((a, b) => a + b.v, 0)));
  const maxOut = Math.max(1, ...outs.map((s) => s.reduce((a, b) => a + b.v, 0)));
  const span = maxIn + maxOut;
  const x = (i: number) => L + (i * (W - L - R)) / 12;
  const bw = (W - L - R) / 12 - 10;
  const zeroY = T + (maxIn / span) * (H - T - B);
  const h = (v: number) => (v / span) * (H - T - B);

  return (
    <Frame title="Money in and out"
           subtitle="Above the line is money arriving, below it is money leaving. Stock bought is money out that is not yet a cost.">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
           aria-label="Money in and out by month, split by kind.">
        <line x1={L} x2={W - R} y1={zeroY} y2={zeroY} stroke="var(--viz-line)" strokeWidth="1.5" opacity="0.45" />
        <text x={L - 8} y={T + 10} textAnchor="end" fontSize="10">{eur0(maxIn)}</text>
        <text x={L - 8} y={zeroY + 3} textAnchor="end" fontSize="10">0</text>
        <text x={L - 8} y={H - B} textAnchor="end" fontSize="10">{eur0(-maxOut)}</text>

        {MONTHS.map((m, i) => {
          const bx = x(i) + 5;
          let up = zeroY, down = zeroY;
          const dim = hover !== null && hover !== i ? 0.35 : 1;
          return (
            <g key={m} opacity={dim}>
              {ins[i].map((s) => {
                if (s.v <= 0) return null;
                const bh = h(s.v); up -= bh;
                return <rect key={s.key} x={bx} y={up} width={bw} height={Math.max(0, bh - 2)} rx="2"
                             fill={`var(--s-${s.key})`} />;
              })}
              {outs[i].map((s) => {
                if (s.v <= 0) return null;
                const bh = h(s.v); const yy = down; down += bh;
                return <rect key={s.key} x={bx} y={yy + 2} width={bw} height={Math.max(0, bh - 2)} rx="2"
                             fill={`var(--s-${s.key})`} />;
              })}
              <rect x={x(i)} y={T} width={(W - L - R) / 12} height={H - T - B} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
        {MONTHS.map((m, i) => (
          <text key={m} x={x(i) + 5 + bw / 2} y={H - 8} textAnchor="middle" fontSize="10">{m}</text>
        ))}
      </svg>
      <Legend keys={["revenue", "funding", "cogs", "inventory", "opex", "development"]} />
      {hover !== null && (
        <p className="text-[11px] admin-muted mt-1">
          <span className="font-semibold admin-heading">{MONTHS[hover]}</span>
          {[...ins[hover], ...outs[hover]].filter((s) => s.v > 0).map((s) => (
            <span key={s.key}>{" · "}{SERIES.find((x) => x.key === s.key)?.label} {eur0(s.v)}</span>
          ))}
        </p>
      )}
    </Frame>
  );
}

/* ── 3. What each thing cost and earned ───────────────────────────────────── */

export function ObjectChart({ nodes }: { nodes: CostObjectNode[] }) {
  const rows = nodes.filter((n) => n.total.revenue > 0 || n.total.cogs + n.total.inventory + n.total.opex + n.total.development > 0);
  if (!rows.length) {
    return (
      <Frame title="What the money was for">
        <p className="text-sm admin-muted py-6 text-center">
          Nothing is allocated to a product or project yet.
        </p>
      </Frame>
    );
  }
  const cost = (n: CostObjectNode) => n.total.cogs + n.total.inventory + n.total.opex + n.total.development;
  const max = Math.max(1, ...rows.map((n) => Math.max(n.total.revenue, cost(n))));

  return (
    <Frame title="What the money was for"
           subtitle="Everything booked to a range, rolled up from the sizes beneath it.">
      <div className="flex flex-col gap-3 mt-1">
        {rows.map((n) => (
          <div key={n.id} className="grid gap-1" style={{ gridTemplateColumns: "8rem 1fr" }}>
            <span className="text-xs admin-heading font-semibold self-center truncate" title={n.name}>{n.name}</span>
            <div className="flex flex-col gap-1">
              <Bar label="in" value={n.total.revenue} max={max} varName="--s-revenue" />
              <Bar label="out" value={cost(n)} max={max} varName="--s-cogs" />
            </div>
          </div>
        ))}
      </div>
      <Legend keys={["revenue", "cogs"]} />
    </Frame>
  );
}

function Bar({ label, value, max, varName }: { label: string; value: number; max: number; varName: string }) {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-4 rounded-sm relative" style={{ background: "var(--viz-grid)" }}>
        <div className="h-4 rounded-sm" style={{ width: `${pct}%`, background: `var(${varName})` }} />
      </div>
      <span className="text-[11px] tabular-nums admin-muted w-24 text-right shrink-0">
        {label} {eur0(value)}
      </span>
    </div>
  );
}
