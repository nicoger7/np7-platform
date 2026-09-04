"use client";

import { useMemo, useState } from "react";
import { MONTHS } from "@/lib/finance/board";
import type { Period } from "@/lib/finance/period";
import type { DatedEvent } from "@/lib/finance/collect-sources";

/**
 * What actually happened, on the day it happened.
 *
 * The plan above is monthly and can only be monthly: a budget line says
 * "April", never "the 19th". Dividing April by four to draw weeks would invent
 * precision that does not exist anywhere in the data.
 *
 * What HAPPENED is different. A payment, a receipt, an invoice all carry a real
 * date, so this draws the days themselves and puts each event where it belongs.
 * That is the honest way to answer "show me the quarter in finer grain": keep
 * the plan blocky and let reality be exact.
 *
 * Events with no date are not placed. They are counted and listed underneath,
 * because "we do not know when" and "it happened on the 1st" are different
 * facts and only one of them is true.
 */

const eur0 = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const SAYS: Record<string, string> = {
  exp_costs: "Trip cost",
  exp_payments: "Booking payment",
  hw_po_lines: "On order",
  hw_receipts: "Stock received",
  hw_shipment_costs: "Freight and duty",
  hw_orders: "Shop order",
  hw_po_payments: "Supplier payment",
  documents: "Invoice",
};

const dayCount = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function ActualEvents({ events, period, year }: {
  events: DatedEvent[]; period: Period; year: number;
}) {
  const [hover, setHover] = useState<DatedEvent | null>(null);

  const { from, span, inWindow, undated, outside } = useMemo(() => {
    const from = `${year}-${String(period.from).padStart(2, "0")}-01`;
    const to = `${year}-${String(period.to).padStart(2, "0")}-${String(dayCount(year, period.to)).padStart(2, "0")}`;
    const dated = events.filter((e) => e.on !== null);
    const inWindow = dated.filter((e) => e.on! >= from && e.on! <= to);
    return {
      from, to,
      span: Math.max(1, (Date.parse(to) - Date.parse(from)) / 86_400_000),
      inWindow,
      undated: events.filter((e) => e.on === null),
      outside: dated.length - inWindow.length,
    };
  }, [events, period, year]);

  if (!events.length) return null;

  const W = 1000, H = 150, L = 8, R = 8, MID = 74;
  const x = (iso: string) => L + ((Date.parse(iso) - Date.parse(from)) / 86_400_000 / span) * (W - L - R);
  const peak = Math.max(1, ...inWindow.map((e) => e.amount));
  // Square-root, so one 100k container does not flatten every 300 euro invoice
  // into an invisible speck.
  const r = (a: number) => 3 + Math.sqrt(a / peak) * 13;

  const months: number[] = [];
  for (let m = period.from; m <= period.to; m++) months.push(m);

  const total = (inflow: boolean) =>
    inWindow.filter((e) => e.inflow === inflow).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="fin-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="fin-title">What actually happened</h3>
          <p className="fin-sub mt-0.5 max-w-prose">
            Every recorded payment, receipt and invoice, on its real date. The plan above is
            monthly because that is all a plan can honestly be; this is not.
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="fin-label">In</div>
            <div className="fin-num text-[15px] tabular-nums">{eur0(total(true))}</div>
          </div>
          <div>
            <div className="fin-label">Out</div>
            <div className="fin-num text-[15px] tabular-nums">{eur0(total(false))}</div>
          </div>
        </div>
      </div>

      {inWindow.length === 0 ? (
        <p className="admin-muted text-[13px] mt-4">
          Nothing recorded in {months.length === 12 ? String(year)
            : months.length === 1 ? `${MONTHS[period.from - 1]} ${year}`
            : `${MONTHS[period.from - 1]}–${MONTHS[period.to - 1]} ${year}`}
          {outside > 0 && <> · {outside} {outside === 1 ? "event sits" : "events sit"} outside it</>}.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-3" role="img"
             aria-label={`${inWindow.length} recorded events, plotted on the day each happened.`}>
          <line x1={L} x2={W - R} y1={MID} y2={MID} stroke="var(--viz-grid)" strokeWidth="1" />

          {/* month boundaries, so a day has something to be read against */}
          {months.map((m) => {
            const start = `${year}-${String(m).padStart(2, "0")}-01`;
            return (
              <g key={m}>
                <line x1={x(start)} x2={x(start)} y1={10} y2={H - 22}
                      stroke="var(--viz-grid)" strokeWidth="1" />
                <text x={x(start) + 5} y={H - 8} fontSize="12" opacity={0.75}>{MONTHS[m - 1]}</text>
              </g>
            );
          })}

          {inWindow.map((e) => (
            <circle
              key={e.id}
              cx={x(e.on!)}
              cy={e.inflow ? MID - r(e.amount) - 2 : MID + r(e.amount) + 2}
              r={r(e.amount)}
              fill={`var(--s-${e.inflow ? "revenue" : e.group === "inventory" ? "inventory" : "cogs"})`}
              fillOpacity={e.settled ? 0.75 : 0.28}
              stroke={hover?.id === e.id ? "var(--viz-line)" : "none"}
              strokeWidth="1.5"
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap mt-1">
        <p className="fin-sub">
          {hover ? (
            <>
              <span className="fin-num">{hover.label}</span>
              {" · "}{eur0(hover.amount)}{" · "}
              {new Date(hover.on!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              {" · "}{SAYS[hover.table] ?? hover.table}
              {!hover.settled && " · not settled yet"}
            </>
          ) : (
            <>Solid is settled, faded is promised. Above the line is money in.</>
          )}
        </p>
        {outside > 0 && <span className="fin-sub">{outside} outside this window</span>}
      </div>

      {undated.length > 0 && (
        <div className="mt-3 fin-rule pt-3">
          <p className="fin-label mb-1.5">No date recorded · {undated.length}</p>
          <p className="fin-sub max-w-prose mb-2">
            These cannot be placed, so they are not drawn. Giving them a date is all it takes.
          </p>
          <ul className="flex flex-col gap-1">
            {undated.slice(0, 6).map((e) => (
              <li key={e.id} className="text-[12.5px] admin-muted flex justify-between gap-3">
                <span className="truncate">{e.label}<span className="fin-sub"> · {SAYS[e.table] ?? e.table}</span></span>
                <span className="tabular-nums shrink-0">{eur0(e.amount)}</span>
              </li>
            ))}
          </ul>
          {undated.length > 6 && <p className="fin-sub mt-1">and {undated.length - 6} more</p>}
        </div>
      )}
    </div>
  );
}
