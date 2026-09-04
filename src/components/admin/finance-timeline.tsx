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
  // A set, not a single index: these are twelve independent cards side by side,
  // and opening March is not a reason to close February.
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (!next.delete(i)) next.add(i);
    return next;
  });

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
    return <p className="fin-sub py-10 text-center">Nothing planned in this year yet.</p>;
  }

  return (
    <div className="viz fin space-y-4">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* the year at a glance: how heavy each month is, and where cash sits */}
      <div className="fin-card">
        <h3 className="fin-title">The year at a glance</h3>
        <p className="fin-sub mb-4">Bar height is how much money moves that month. Underneath is the closing balance.</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
          {MONTHS.map((m, i) => {
            const moved = byMonth[i].reduce((s, x) => s + x.amount, 0);
            const active = open.has(i);
            return (
              <button key={m} onClick={() => toggle(i)}
                      className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${active ? "bg-[var(--admin-accent-weak)]" : "hover:bg-[var(--admin-accent-weak)]"}`}
                      title={`${m}: ${byMonth[i].length} items, ${eur0(moved)} moved`}>
                <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                  <div className="w-full"
                       style={{ height: `${Math.max(moved > 0 ? 4 : 0, (moved / busiest) * 64)}px`,
                                borderRadius: 5, background: moved > 0 ? "var(--s-revenue)" : "transparent",
                                opacity: active ? 1 : .45, transition: "opacity .2s ease" }} />
                </div>
                <span className="text-[10.5px] admin-faint">{m}</span>
                <span className={`text-[10px] tabular-nums ${cash[i] < 0 ? "text-red-400" : "admin-muted"}`}>
                  {cash[i] === 0 ? "" : eur0(cash[i])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Month by month.
          This was one column of every line in every month: twelve cards, around
          two hundred rows, and on a wide screen the label sat at the far left
          with its amount at the far right. Now the months are a grid, each shows
          what it is worth and its biggest few items, and the rest opens where it
          is rather than making the page longer. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(21rem, 1fr))" }}>
        {live.map(({ i }) => {
          const evs = byMonth[i];
          const inTotal = evs.filter((e) => e.inflow).reduce((s, e) => s + e.amount, 0);
          const outTotal = evs.filter((e) => !e.inflow).reduce((s, e) => s + e.amount, 0);
          const expanded = open.has(i);
          const shown = expanded ? evs : evs.slice(0, 5);
          return (
            <div key={i} className="fin-card !p-0 overflow-hidden">
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold fin-num">{MONTHS[i]}</span>
                  <span className={`text-[15px] font-semibold tabular-nums ${cash[i] < 0 ? "text-red-400" : "fin-num"}`}
                        style={{ letterSpacing: "-.02em" }}>
                    {eur0(cash[i])}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                  <span className="fin-sub">{evs.length} item{evs.length === 1 ? "" : "s"}</span>
                  <span className="fin-sub tabular-nums">
                    {inTotal > 0 && <span style={{ color: "var(--s-revenue)" }}>+{eur0(inTotal)}</span>}
                    {inTotal > 0 && outTotal > 0 && " · "}
                    {outTotal > 0 && <span style={{ color: "var(--s-cogs)" }}>−{eur0(outTotal)}</span>}
                  </span>
                </div>
              </div>

              <div className="px-4 pb-3 flex flex-col">
                {shown.map((e, k) => (
                  <div key={k} className="fin-row flex items-baseline gap-2 py-[3px] px-1 -mx-1 rounded text-[12.5px]">
                    <span className="w-[6px] h-[6px] rounded-full shrink-0 translate-y-[-1px]"
                          style={{ background: colourOf(e.group) }} />
                    <span className="admin-muted truncate" title={e.label}>{e.label}</span>
                    {/* the amount sits against the label, not against the far
                        edge of a 1600px screen */}
                    <span className="flex-1 border-b border-dotted self-end mb-1 mx-1"
                          style={{ borderColor: "var(--fin-hairline)" }} />
                    <span className={`tabular-nums shrink-0 ${e.inflow ? "" : "admin-faint"}`}
                          style={e.inflow ? { color: "var(--s-revenue)" } : undefined}>
                      {e.inflow ? "+" : "−"}{eur0(e.amount)}
                    </span>
                  </div>
                ))}
                {evs.length > 5 && (
                  <button onClick={() => toggle(i)}
                          className="fin-sub text-left mt-1 px-1 -mx-1 py-1 rounded hover:bg-[var(--fin-inset)]">
                    {expanded ? "Show less" : `${evs.length - 5} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
