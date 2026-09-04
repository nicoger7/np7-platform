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
.viz, .fin { --s-revenue:#2a78d6; --s-cogs:#eb6834; --s-inventory:#1baf7a;
       --s-opex:#eda100; --s-development:#e87ba4; --s-funding:#008300;
       --viz-line:#0b0b0b; --viz-grid:rgba(15,23,42,.07); --viz-neg:#e34948;
       --viz-neg-band:rgba(227,73,72,.07);
       --fin-hairline:rgba(15,23,42,.08);
       --fin-raise:0 1px 1px rgba(15,23,42,.04), 0 8px 24px -14px rgba(15,23,42,.22);
       --fin-inset:rgba(15,23,42,.045);
       --fin-pill:#ffffff;
       --fin-pill-shadow:0 1px 3px rgba(15,23,42,.14), 0 0 0 .5px rgba(15,23,42,.06); }
/* Follow the ADMIN's own switch first. The OS setting only decides when the
   admin has not said, which in practice it always has. */
[data-admin-theme="light"] .viz, [data-admin-theme="light"] .fin { color-scheme: light; }
@media (prefers-color-scheme: dark) {
  :where(:not([data-admin-theme="light"])) .viz,
  :where(:not([data-admin-theme="light"])) .fin,
  .viz:where(:not([data-admin-theme="light"] *)),
  .fin:where(:not([data-admin-theme="light"] *)) {
    --s-revenue:#3987e5; --s-cogs:#d95926; --s-inventory:#199e70;
    --s-opex:#c98500; --s-development:#d55181; --s-funding:#008300;
    --viz-line:#f2f2f0; --viz-grid:rgba(255,255,255,.07); --viz-neg:#e66767;
    --viz-neg-band:rgba(230,103,103,.09);
    --fin-hairline:rgba(255,255,255,.09);
    --fin-raise:0 1px 1px rgba(0,0,0,.4), 0 10px 30px -16px rgba(0,0,0,.8);
    --fin-inset:rgba(255,255,255,.05);
    --fin-pill:rgba(255,255,255,.12);
    --fin-pill-shadow:0 1px 3px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.08);
  }
}
/* Both combinators: the attribute usually sits on an ancestor (.admin-root),
   but it can land on the same element, and a descendant selector never
   matches itself. */
[data-admin-theme="dark"] .viz, [data-admin-theme="dark"] .fin,
[data-admin-theme="dark"].viz, [data-admin-theme="dark"].fin {
  --s-revenue:#3987e5; --s-cogs:#d95926; --s-inventory:#199e70;
  --s-opex:#c98500; --s-development:#d55181; --s-funding:#008300;
  --viz-line:#f2f2f0; --viz-grid:rgba(255,255,255,.07); --viz-neg:#e66767;
  --viz-neg-band:rgba(230,103,103,.09);
  --fin-hairline:rgba(255,255,255,.09);
  --fin-raise:0 1px 1px rgba(0,0,0,.4), 0 10px 30px -16px rgba(0,0,0,.8);
  --fin-inset:rgba(255,255,255,.05);
  --fin-pill:rgba(255,255,255,.12);
  --fin-pill-shadow:0 1px 3px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.08);
}

/* Type: the platform face first, numerals always tabular so a column of money
   lines up and a changing figure does not shuffle its neighbours. */
.fin, .viz {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
               "Segoe UI", system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
.viz text { fill: var(--admin-text-muted); font-variant-numeric: tabular-nums; }
.viz .viz-strong { fill: var(--admin-text); }

/* Surfaces: a hairline and a soft lift instead of a drawn box. */
.fin-card {
  background: var(--admin-surface);
  border: .5px solid var(--fin-hairline);
  border-radius: 18px;
  box-shadow: var(--fin-raise);
  padding: 20px 22px;
}
.fin-title { font-size: 15px; font-weight: 600; letter-spacing: -.012em; color: var(--admin-text); }
.fin-sub   { font-size: 12px; color: var(--admin-text-faint); letter-spacing: -.005em; }
.fin-label { font-size: 11px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase;
             color: var(--admin-text-faint); }
.fin-hero  { font-size: clamp(30px, 4.4vw, 42px); font-weight: 600; letter-spacing: -.03em;
             line-height: 1.02; color: var(--admin-text); }
.fin-num   { font-weight: 500; letter-spacing: -.015em; color: var(--admin-text); }
.fin-rule  { border-top: .5px solid var(--fin-hairline); }

/* Segmented control. */
.fin-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 12px;
           background: var(--fin-inset); }
.fin-seg button {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font: 500 12.5px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  letter-spacing: -.01em; color: var(--admin-text-muted);
  padding: 7px 14px; border-radius: 10px;
  transition: background .22s cubic-bezier(.32,.72,0,1), color .22s ease, box-shadow .22s ease;
}
.fin-seg button[data-on="true"] {
  background: var(--fin-pill); color: var(--admin-text); box-shadow: var(--fin-pill-shadow);
}
.fin-seg button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }

.fin-row { transition: background .18s ease; }
.fin-row:hover { background: var(--fin-inset); }

@media (prefers-reduced-motion: reduce) {
  .fin-seg button, .fin-row { transition: none; }
}
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
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] admin-muted"
              style={{ letterSpacing: "-.01em" }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(${s.varName})` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Frame({ title, subtitle, hero, children, footer }: {
  title: string; subtitle?: string; hero?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="fin-card viz fin">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="fin-title">{title}</h3>
          {subtitle && <p className="fin-sub mt-0.5 max-w-prose">{subtitle}</p>}
        </div>
        {hero}
      </div>
      <div className="mt-4">{children}</div>
      {footer}
    </div>
  );
}

/* ── 1. Cash position ─────────────────────────────────────────────────────── */

export function CashChart({ pnl, opening, scopeName }: { pnl: Pnl; opening: number; scopeName?: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1400, H = 230, L = 10, R = 10, T = 26, B = 26;
  const pts = pnl.accumulated;
  const lo = Math.min(0, ...pts, opening);
  const hi = Math.max(0, ...pts, opening);
  const span = hi - lo || 1;
  const x = (i: number) => L + (i * (W - L - R)) / 11;
  const y = (v: number) => T + (hi - v) * (H - T - B) / span;
  const zeroY = y(0);

  // A rounded polyline reads calmer than corners at every month.
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const area = `${path} L${x(11)},${zeroY} L${x(0)},${zeroY} Z`;
  const lowIdx = pts.indexOf(pnl.lowestPoint);
  const closing = pts[11] ?? 0;
  const shown = hover ?? 11;

  return (
    <Frame
      title={scopeName ? `${scopeName} · money in and out` : "Cash position"}
      subtitle={scopeName
        ? `What ${scopeName} costs and earns, month by month, from zero. Funding is not allocated to a product, so this is a contribution, not a bank balance.`
        : opening !== 0 ? `Opening at ${eur0(opening)}. The low point is what the year needs funding for.`
                        : "Closing balance each month. The low point is what the year needs funding for."}
      hero={
        <div className="text-right">
          <div className="fin-label">{hover === null ? (scopeName ? "Net for the year" : "Year end") : MONTHS[shown]}</div>
          <div className={`fin-hero ${pts[shown] < 0 ? "text-red-400" : ""}`}>{eur0(pts[shown])}</div>
          <div className="fin-sub mt-0.5">
            low {eur0(pnl.lowestPoint)} · {MONTHS[lowIdx >= 0 ? lowIdx : 0]}
          </div>
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 240 }} role="img"
           aria-label={`Cash position by month. Lowest ${eur2(pnl.lowestPoint)}, closing ${eur2(closing)}.`}>
        <defs>
          <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--s-revenue)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--s-revenue)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* months under water, tinted rather than boxed */}
        {pts.map((v, i) => v < 0 ? (
          <rect key={i} x={x(i) - (W - L - R) / 22} y={T} width={(W - L - R) / 11} height={H - T - B}
                fill="var(--viz-neg-band)" />
        ) : null)}

        <line x1={L} x2={W - R} y1={zeroY} y2={zeroY} stroke="var(--viz-grid)" strokeWidth="1" />
        <path d={area} fill="url(#cashFill)" />
        <path d={path} fill="none" stroke="var(--viz-line)" strokeWidth="2.25"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* one resting dot at the end, the rest appear under the cursor */}
        <circle cx={x(11)} cy={y(closing)} r="4" fill="var(--viz-line)"
                stroke="var(--admin-surface)" strokeWidth="2.5" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--viz-grid)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(pts[hover])} r="5"
                    fill={pts[hover] < 0 ? "var(--viz-neg)" : "var(--viz-line)"}
                    stroke="var(--admin-surface)" strokeWidth="2.5" />
          </g>
        )}

        {MONTHS.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="13"
                opacity={hover === null || hover === i ? 1 : 0.45}>{m}</text>
        ))}
        {MONTHS.map((_, i) => (
          <rect key={i} x={x(i) - (W - L - R) / 22} y={0} width={(W - L - R) / 11} height={H}
                fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <p className="fin-sub mt-1">
          moved <span className="fin-num">{eur2(pnl.cashMovement.byMonth[hover])}</span> in {MONTHS[hover]}
        </p>
      )}
    </Frame>
  );
}

/* ── 2. Money in and out ──────────────────────────────────────────────────── */

export function FlowChart({ pnl }: { pnl: Pnl }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 260, L = 78, R = 16, T = 16, B = 28;
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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 250 }} role="img"
           aria-label="Money in and out by month, split by kind.">
        <line x1={L} x2={W - R} y1={zeroY} y2={zeroY} stroke="var(--viz-line)" strokeWidth="1.5" opacity="0.45" />
        <text x={L - 8} y={T + 10} textAnchor="end" fontSize="12">{eur0(maxIn)}</text>
        <text x={L - 8} y={zeroY + 3} textAnchor="end" fontSize="12">0</text>
        <text x={L - 8} y={H - B} textAnchor="end" fontSize="12">{eur0(-maxOut)}</text>

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
          <text key={m} x={x(i) + 5 + bw / 2} y={H - 8} textAnchor="middle" fontSize="13">{m}</text>
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
           subtitle="Everything booked to a range, rolled up from the sizes beneath it. Units bought and units sold are counted apart, because in one window they differ.">
      <div className="flex flex-col gap-4 mt-1">
        {rows.map((n) => {
          const t = n.total;
          const hasUnits = t.unitsBought > 0 || t.unitsSold > 0;
          return (
            <div key={n.id} className="grid gap-1" style={{ gridTemplateColumns: "8rem 1fr" }}>
              <span className="text-[13px] fin-num self-center truncate" title={n.name}>{n.name}</span>
              <div className="flex flex-col gap-1">
                <Bar label="in" value={t.revenue} max={max} varName="--s-revenue" />
                <Bar label="out" value={cost(n)} max={max} varName="--s-cogs" />
                {hasUnits && (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 mt-1">
                    {t.unitsBought > 0 && (
                      <span className="fin-sub">
                        {t.unitsBought.toLocaleString("de-DE")} bought
                        {t.unitCost != null && <> at <span className="fin-num">{eur2(t.unitCost)}</span> each</>}
                      </span>
                    )}
                    {t.unitsSold > 0 && (
                      <span className="fin-sub">
                        {t.unitsSold.toLocaleString("de-DE")} sold
                        {t.unitRevenue != null && <> at <span className="fin-num">{eur2(t.unitRevenue)}</span></>}
                      </span>
                    )}
                    {t.unitMargin != null && (
                      <span className="text-[12px] font-semibold" style={{
                        color: t.unitMargin >= 0 ? "var(--s-inventory)" : "var(--viz-neg)", letterSpacing: "-.01em" }}>
                        {t.unitMargin >= 0 ? "+" : ""}{eur2(t.unitMargin)} a unit
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="fin-sub mt-3">
        A unit costs what it takes to land it, goods and freight. Overheads and development are not in
        it, because they do not scale with one more board.
      </p>
      <Legend keys={["revenue", "cogs"]} />
    </Frame>
  );
}

function Bar({ label, value, max, varName }: { label: string; value: number; max: number; varName: string }) {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full relative overflow-hidden" style={{ background: "var(--fin-inset)" }}>
        <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, background: `var(${varName})` }} />
      </div>
      <span className="text-[11.5px] tabular-nums admin-muted w-28 text-right shrink-0" style={{ letterSpacing: "-.01em" }}>
        {label} <span className="fin-num">{eur0(value)}</span>
      </span>
    </div>
  );
}
