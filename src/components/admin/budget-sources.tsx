"use client";

import { MONTHS } from "@/lib/finance/board";

/**
 * Where these numbers come from.
 *
 * The budget is a set of decisions someone typed, and that is right: nothing
 * can derive an intention. But the moment a decision turns into an order or an
 * invoice, some other system owns the truth about it, and this panel is that
 * boundary made visible.
 *
 * It shows what each of those systems currently says, whether the budget
 * predicted it, and where to go to change it. The empty state matters as much
 * as the full one: a company with no purchase orders yet should be told that
 * plainly rather than shown a confident zero.
 */

export type SourceSummary = {
  table: string; group: string; count: number;
  committed: number[]; actual: number[];
  committedTotal: number; actualTotal: number;
  undatedCommitted: number; undatedActual: number;
  href: string | null;
};

export type CashRow = { id: string; label: string; month: number | null; planned: number; paid: number; href: string | null };

export type Sources = {
  byLine: Record<string, { committed: number[]; actual: number[] }>;
  unclaimed: SourceSummary[];
  cash: CashRow[];
  stranded: { count: number; amount: number };
  consulted: string[];
};

/** What each table is, said the way someone would say it out loud. */
const SAYS: Record<string, { name: string; what: string }> = {
  exp_costs:         { name: "Trip costs",        what: "hotels, coaches and vans, per edition" },
  exp_payments:      { name: "Booking payments",  what: "money guests have actually paid" },
  hw_po_lines:       { name: "Stock on order",    what: "ordered from the factory, not yet here" },
  hw_receipts:       { name: "Stock received",    what: "arrived, at what it really cost to land" },
  hw_shipment_costs: { name: "Freight and duty",  what: "quoted until the forwarder invoices" },
  hw_orders:         { name: "Shop orders",       what: "what customers have bought" },
  documents:         { name: "Invoices",          what: "issued out of the documents section" },
};

const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Twelve months at a glance. Bars are relative to the biggest month shown, so
 *  the shape is readable even when the amounts are small. */
function MonthStrip({ committed, actual }: { committed: number[]; actual: number[] }) {
  const peak = Math.max(1, ...committed, ...actual);
  return (
    <div className="flex items-end gap-[3px] h-8" aria-hidden>
      {MONTHS.map((m, i) => {
        const c = committed[i] ?? 0, a = actual[i] ?? 0;
        return (
          <div key={m} className="flex-1 flex flex-col justify-end gap-[1px]" title={`${m}: ${eur(a)} actual, ${eur(c)} committed`}>
            {c > 0 && <div style={{ height: `${Math.max(2, (c / peak) * 26)}px`, background: "var(--fin-accent-soft, #c8cdd6)", borderRadius: 2 }} />}
            {a > 0 && <div style={{ height: `${Math.max(2, (a / peak) * 26)}px`, background: "var(--fin-accent, #2f6df6)", borderRadius: 2 }} />}
          </div>
        );
      })}
    </div>
  );
}

export function BudgetSources({ sources, entityName, year }: {
  sources: Sources | null; entityName: string | null | undefined; year: number;
}) {
  if (!sources) return null;
  const { unclaimed, cash, stranded, consulted } = sources;
  const linkedLines = Object.keys(sources.byLine).length;
  const cashPlanned = cash.reduce((s, c) => s + c.planned, 0);
  const cashPaid = cash.reduce((s, c) => s + c.paid, 0);
  const nothingYet = unclaimed.length === 0 && cash.length === 0;

  return (
    <div className="fin-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="fin-title">Where these numbers come from</h3>
          <p className="fin-sub mt-0.5 max-w-prose">
            The plan above is typed, because nothing can guess what you intend to spend. Everything
            below is read live from the system that owns it, never copied, so changing it there
            changes it here.
          </p>
        </div>
        {linkedLines > 0 && (
          <span className="fin-sub whitespace-nowrap">
            {linkedLines} budget {linkedLines === 1 ? "line is" : "lines are"} attached to a source
          </span>
        )}
      </div>

      {nothingYet ? (
        <div className="mt-4 fin-rule pt-4">
          <p className="admin-muted text-[13px] max-w-prose">
            Nothing feeds {entityName ?? "this company"} in {year} yet. That is not a fault in the
            budget: {consulted.length ? "the tables it reads are empty" : "there is nothing to read"}.
            The first purchase order raised, or the first cost recorded against a trip, appears here
            without anyone entering it twice.
          </p>
          {consulted.length > 0 && (
            <p className="fin-sub mt-2">Watching: {consulted.join(", ")}</p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {unclaimed.map((s) => {
            const said = SAYS[s.table] ?? { name: s.table, what: "" };
            return (
              <div key={`${s.table}|${s.group}`} className="fin-rule pt-3 first:pt-0 first:border-0">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <span className="fin-num text-[13.5px]">{said.name}</span>
                    <span className="fin-sub"> · {said.what}</span>
                  </div>
                  <div className="flex items-baseline gap-4 tabular-nums text-[12.5px] whitespace-nowrap">
                    {s.committedTotal > 0 && (
                      <span className="admin-muted">{eur(s.committedTotal)} <span className="fin-sub">committed</span></span>
                    )}
                    {s.actualTotal > 0 && (
                      <span className="fin-num">{eur(s.actualTotal)} <span className="fin-sub">actual</span></span>
                    )}
                    {s.href && (
                      <a href={s.href} className="fin-sub underline underline-offset-2 hover:no-underline">open</a>
                    )}
                  </div>
                </div>
                <div className="mt-1.5"><MonthStrip committed={s.committed} actual={s.actual} /></div>
                <p className="fin-sub mt-1">
                  {s.count} {s.count === 1 ? "record" : "records"}, none of them predicted by a budget line
                  {s.undatedCommitted + s.undatedActual > 0 && (
                    <span> · {eur(s.undatedCommitted + s.undatedActual)} of it carries no date</span>
                  )}
                </p>
              </div>
            );
          })}

          {cash.length > 0 && (
            <div className="fin-rule pt-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <span className="fin-num text-[13.5px]">Supplier payments</span>
                  <span className="fin-sub"> · deposits and balances, by the date they are due</span>
                </div>
                <div className="flex items-baseline gap-4 tabular-nums text-[12.5px]">
                  {cashPlanned > 0 && <span className="admin-muted">{eur(cashPlanned)} <span className="fin-sub">due</span></span>}
                  {cashPaid > 0 && <span className="fin-num">{eur(cashPaid)} <span className="fin-sub">paid</span></span>}
                </div>
              </div>
              <p className="fin-sub mt-1 max-w-prose">
                Kept out of the P&amp;L on purpose. A deposit is not a second cost, it is the same
                stock paid for earlier, and the only place the timing changes the answer is the cash
                line, where it changes it a great deal.
              </p>
            </div>
          )}
        </div>
      )}

      {stranded.count > 0 && (
        <p className="mt-4 text-[12.5px] px-3 py-2 rounded-lg"
           style={{ background: "rgba(220,120,30,.10)", color: "var(--admin-text)" }}>
          {stranded.count} {stranded.count === 1 ? "cost carries" : "costs carry"} no date and no
          edition, so {eur(stranded.amount)} cannot be placed in any month and is in no budget at
          all. Giving them a date is enough to bring them in.
        </p>
      )}
    </div>
  );
}
