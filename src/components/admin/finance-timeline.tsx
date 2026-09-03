"use client";

import { useMemo, useState } from "react";
import { MONTHS, type Board } from "@/lib/finance/board";
import { VIZ_CSS } from "./finance-charts";

/**
 * The year as a roadmap.
 *
 * The grid answers "what does this line do across the year"; this answers the
 * other question, "what happens in March". Every planned amount is an event on
 * its month, sized by what it moves, with the cash position running underneath
 * so a big month can be read against whether the money is there.
 */

const eur0 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

type Event = { label: string; amount: number; group: string; inflow: boolean };

export function FinanceTimeline({ board, categoryGroup }: {
  board: Board;
  categoryGroup: Map<string, string | null>;
}) {
  const [open, setOpen] = useState<number | null>(null);

  const byMonth = useMemo(() => {
    const out: Event[][] = Array.from({ length: 12 }, () => []);
    for (const g of [...board.revenue, ...board.cost]) {
      for (const row of g.rows) {
        const group = row.categoryId ? categoryGroup.get(row.categoryId) ?? "opex" : "opex";
        const inflow = group === "revenue" || group === "financing";
        row.cells.forEach((c, i) => {
          if (c.planned) out[i].push({ label: row.label, amount: c.planned, group, inflow });
        });
      }
    }
    return out.map((evs) => evs.sort((a, b) => b.amount - a.amount));
  }, [board, categoryGroup]);

  const colourOf = (group: string) =>
    group === "revenue" ? "var(--s-revenue)"
      : group === "financing" ? "var(--s-funding)"
      : group === "cogs" ? "var(--s-cogs)"
      : group === "inventory" ? "var(--s-inventory)"
      : group === "development" ? "var(--s-development)"
      : "var(--s-opex)";

  const cash = board.pnlPlanned.accumulated;
  const busiest = Math.max(1, ...byMonth.map((e) => e.reduce((s, x) => s + x.amount, 0)));
  const live = byMonth.map((e, i) => ({ i, count: e.length })).filter((m) => m.count > 0);
  if (!live.length) {
    return <p className="text-sm admin-muted py-8 text-center">Nothing planned in this year yet.</p>;
  }

  return (
    <div className="viz space-y-4">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* the year at a glance: how heavy each month is, and where cash sits */}
      <div className="admin-card border rounded-xl p-4">
        <h3 className="text-sm font-bold admin-heading mb-1">The year at a glance</h3>
        <p className="text-[11px] admin-faint mb-3">Bar height is how much money moves that month. The line is the closing balance.</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
          {MONTHS.map((m, i) => {
            const moved = byMonth[i].reduce((s, x) => s + x.amount, 0);
            const active = open === i;
            return (
              <button key={m} onClick={() => setOpen(active ? null : i)}
                      className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${active ? "bg-[var(--admin-accent-weak)]" : "hover:bg-[var(--admin-accent-weak)]"}`}
                      title={`${m}: ${byMonth[i].length} items, ${eur0(moved)} moved`}>
                <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                  <div className="w-full rounded-sm"
                       style={{ height: `${Math.max(moved > 0 ? 4 : 0, (moved / busiest) * 56)}px`,
                                background: moved > 0 ? "var(--s-revenue)" : "transparent", opacity: active ? 1 : .55 }} />
                </div>
                <span className="text-[10px] admin-faint">{m}</span>
                <span className={`text-[9px] tabular-nums font-semibold ${cash[i] < 0 ? "text-red-400" : "admin-muted"}`}>
                  {cash[i] === 0 ? "" : eur0(cash[i])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* month by month */}
      <div className="flex flex-col gap-2">
        {live.map(({ i }) => {
          const evs = byMonth[i];
          const inTotal = evs.filter((e) => e.inflow).reduce((s, e) => s + e.amount, 0);
          const outTotal = evs.filter((e) => !e.inflow).reduce((s, e) => s + e.amount, 0);
          const collapsed = open !== null && open !== i;
          return (
            <div key={i} className={`admin-card border rounded-xl overflow-hidden ${collapsed ? "opacity-50" : ""}`}>
              <button onClick={() => setOpen(open === i ? null : i)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                <span className="text-xs font-bold admin-heading w-12 shrink-0">{MONTHS[i]}</span>
                <span className="text-[11px] admin-faint shrink-0">{evs.length} item{evs.length === 1 ? "" : "s"}</span>
                <span className="flex-1" />
                {inTotal > 0 && <span className="text-[11px] tabular-nums" style={{ color: "var(--s-revenue)" }}>+{eur0(inTotal)}</span>}
                {outTotal > 0 && <span className="text-[11px] tabular-nums" style={{ color: "var(--s-cogs)" }}>−{eur0(outTotal)}</span>}
                <span className={`text-[11px] tabular-nums font-bold w-24 text-right ${cash[i] < 0 ? "text-red-400" : "admin-heading"}`}>
                  {eur0(cash[i])}
                </span>
              </button>
              <div className="px-4 pb-3 flex flex-col gap-1">
                {evs.map((e, k) => (
                  <div key={k} className="flex items-center gap-2 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colourOf(e.group) }} />
                    <span className="admin-muted flex-1 truncate" title={e.label}>{e.label}</span>
                    <span className={`tabular-nums shrink-0 ${e.inflow ? "" : "admin-faint"}`}
                          style={e.inflow ? { color: "var(--s-revenue)" } : undefined}>
                      {e.inflow ? "+" : "−"}{eur0(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
