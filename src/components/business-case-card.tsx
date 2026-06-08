"use client";

import { useEffect, useState } from "react";

interface Case {
  heads: number;
  revenue: number;
  variable_cost: number;
  gross_margin: number;
  overhead: number;
  profit: number;
}

interface Financials {
  currency: string;
  confirmed: Case;
  capacity: Case | null;
  packages: {
    id: string;
    name: string;
    cost_pp: number;
    sell_pp: number;
    margin_pp: number;
    confirmed_count: number;
    component_count: number;
  }[];
  overhead: {
    items: { item: string; amount: number }[];
    fixed_costs: number;
    total: number;
  };
}

function money(currency: string, n: number) {
  const sign = n < 0 ? "−" : "";
  return `${sign}${currency} ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Stacked bar: variable cost + overhead + profit, scaled to revenue.
function ProfitBar({ c }: { c: Case }) {
  const denom = Math.max(c.revenue, c.variable_cost + c.overhead, 1);
  const pct = (v: number) => `${Math.max(0, (v / denom) * 100)}%`;
  const loss = c.profit < 0;
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-surface)" }}>
        <div style={{ width: pct(c.variable_cost), backgroundColor: "#ef4444" }} title={`Variable cost ${c.variable_cost}`} />
        <div style={{ width: pct(c.overhead), backgroundColor: "#f59e0b" }} title={`Overhead ${c.overhead}`} />
        {!loss && <div style={{ width: pct(c.profit), backgroundColor: "#22c55e" }} title={`Profit ${c.profit}`} />}
      </div>
      <div className="flex items-center gap-3 text-[10px] admin-faint">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /> Variable</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} /> Overhead</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: loss ? "#ef4444" : "#22c55e" }} /> {loss ? "Loss" : "Profit"}</span>
      </div>
    </div>
  );
}

function PnL({ title, sub, c, currency, highlight }: { title: string; sub: string; c: Case; currency: string; highlight?: boolean }) {
  const row = (label: string, value: number, opts?: { strong?: boolean; tone?: "muted" | "neg" | "pos" }) => (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className={opts?.strong ? "admin-heading font-medium" : "admin-muted"}>{label}</span>
      <span
        className={`font-mono ${opts?.strong ? "font-bold" : ""} ${
          opts?.tone === "neg" ? "text-red-400" : opts?.tone === "pos" ? "text-green-400" : "admin-muted"
        }`}
      >
        {value < 0 ? money(currency, value) : opts?.tone === "neg" ? `− ${money(currency, value)}` : money(currency, value)}
      </span>
    </div>
  );
  return (
    <div
      className="rounded-xl p-4"
      style={{
        border: `1px solid ${highlight ? "rgba(10,163,199,0.4)" : "var(--admin-border)"}`,
        backgroundColor: highlight ? "rgba(10,163,199,0.05)" : "var(--admin-surface)",
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs font-bold admin-heading">{title}</div>
          <div className="text-[10px] admin-faint">{sub}</div>
        </div>
        <div className={`text-lg font-bold ${c.profit < 0 ? "text-red-400" : "text-green-400"}`}>
          {money(currency, c.profit)}
        </div>
      </div>
      <ProfitBar c={c} />
      <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
        {row("Revenue", c.revenue)}
        {row("Variable cost", c.variable_cost, { tone: "neg" })}
        {row("Gross margin", c.gross_margin, { strong: true })}
        {row("Overhead", c.overhead, { tone: "neg" })}
        {row("Estimated profit", c.profit, { strong: true, tone: c.profit < 0 ? "neg" : "pos" })}
      </div>
    </div>
  );
}

export default function BusinessCaseCard({ editionId }: { editionId: string }) {
  const [fin, setFin] = useState<Financials | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/editions/${editionId}/financials`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setFin(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [editionId]);

  if (loading) {
    return <div className="rounded-xl p-4 text-xs admin-faint" style={{ border: "1px solid var(--admin-border)" }}>Calculating business case…</div>;
  }
  if (!fin) {
    return <div className="rounded-xl p-4 text-xs admin-faint" style={{ border: "1px solid var(--admin-border)" }}>Couldn&apos;t load the business case. Refresh to retry.</div>;
  }

  const { currency, confirmed, capacity } = fin;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
      {/* Headline row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-4 py-3 transition-colors"
        style={{ backgroundColor: "var(--admin-surface)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg
            className={`w-4 h-4 admin-faint transition-transform ${open ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <div className="text-left">
            <div className="text-xs admin-faint">Estimated profit · {confirmed.heads} confirmed</div>
            <div className={`text-xl font-bold ${confirmed.profit < 0 ? "text-red-400" : "text-green-400"}`}>
              {money(currency, confirmed.profit)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] admin-faint uppercase tracking-[0.1em]">{open ? "Hide" : "Business case"}</div>
          {capacity && (
            <div className="text-xs admin-muted">
              at sell-out: <span className={capacity.profit < 0 ? "text-red-400" : "text-green-400"}>{money(currency, capacity.profit)}</span>
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-5" style={{ borderTop: "1px solid var(--admin-border)" }}>
          {/* Confirmed vs capacity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PnL title="Confirmed" sub={`${confirmed.heads} paid/committed`} c={confirmed} currency={currency} highlight />
            {capacity ? (
              <PnL title="Sell-out projection" sub={`${capacity.heads} spots × avg margin`} c={capacity} currency={currency} />
            ) : (
              <div className="rounded-xl p-4 flex items-center justify-center text-xs admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>
                Set max spots on this edition to project a sell-out.
              </div>
            )}
          </div>

          {/* Per-package margins */}
          <div>
            <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-2">Per-package margin (per person)</div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_80px_80px_80px_60px] gap-2 px-3 py-2 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold admin-faint uppercase">Package</span>
                <span className="text-[10px] font-bold admin-faint uppercase text-right">Cost</span>
                <span className="text-[10px] font-bold admin-faint uppercase text-right">Sell</span>
                <span className="text-[10px] font-bold admin-faint uppercase text-right">Margin</span>
                <span className="text-[10px] font-bold admin-faint uppercase text-right">Conf.</span>
              </div>
              {fin.packages.length === 0 ? (
                <div className="px-3 py-3 text-xs admin-faint">No packages on this edition yet.</div>
              ) : (
                fin.packages.map((p) => (
                  <div key={p.id} className="grid grid-cols-[1fr_80px_80px_80px_60px] gap-2 px-3 py-2 items-center" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <span className="text-xs admin-muted truncate">
                      {p.name}
                      {p.component_count === 0 && <span className="ml-1 text-[10px] text-amber-400">(no components)</span>}
                    </span>
                    <span className="text-xs admin-muted font-mono text-right">{money(currency, p.cost_pp)}</span>
                    <span className="text-xs admin-muted font-mono text-right">{money(currency, p.sell_pp)}</span>
                    <span className={`text-xs font-mono text-right font-medium ${p.margin_pp < 0 ? "text-red-400" : "text-green-400"}`}>{money(currency, p.margin_pp)}</span>
                    <span className="text-xs admin-muted font-mono text-right">{p.confirmed_count || "—"}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Overhead breakdown */}
          {(fin.overhead.items.length > 0 || fin.overhead.fixed_costs > 0) && (
            <div>
              <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-2">Overhead — {money(currency, fin.overhead.total)}</div>
              <div className="space-y-1">
                {fin.overhead.fixed_costs > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="admin-muted">Template fixed costs</span>
                    <span className="admin-muted font-mono">{money(currency, fin.overhead.fixed_costs)}</span>
                  </div>
                )}
                {fin.overhead.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="admin-muted truncate pr-2">{it.item}</span>
                    <span className="admin-muted font-mono">{money(currency, it.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] admin-faint">
            Estimate uses package sell − cost rolled up from components, × confirmed heads, minus edition overhead.
            Actuals (real paid vs spent) will replace this once payments land.
          </p>
        </div>
      )}
    </div>
  );
}
