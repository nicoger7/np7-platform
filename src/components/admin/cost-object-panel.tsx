"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * One product line, and every thread that runs out of it.
 *
 * The point is that nothing here is a dead end. The supplier is a link to the
 * supplier, the product is a link to the product, a child range opens in place,
 * a milestone says what it is waiting for, and "show only this" hands the whole
 * dashboard over to it. A card that merely printed these as facts would be
 * prettier and worth less.
 */

const eur0 = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

type Figures = {
  revenue: number; cogs: number; inventory: number; opex: number; development: number;
  unitsBought: number; unitsSold: number;
  unitCost: number | null; unitRevenue: number | null; unitMargin: number | null;
};
type Detail = {
  object: { id: string; name: string; kind: string; note: string | null; parentName: string | null };
  supplier: { id: string; name: string; country: string | null } | null;
  product: { id: string; name: string; slug: string; status: string; price: number | null } | null;
  year: number;
  plan: { id: string; name: string } | null;
  figures: Figures | null;
  children: { id: string; name: string; figures: Figures | null }[];
  lines: { id: string; label: string; month: string; amount_net: number; quantity: number | null; categoryName: string | null }[];
  actuals: { id: string; description: string; amount_net: number; incurred_on: string; paid_on: string | null }[];
  milestones: { id: string; title: string; kind: string; status: string; starts_on: string;
                target_quantity: number | null; target_metric: string | null; amount_net: number | null }[];
};

export function CostObjectPanel({ id, year, onClose, onOpenObject, onFilter }: {
  id: string; year: number;
  onClose: () => void;
  onOpenObject: (id: string) => void;
  onFilter: (id: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/finance/objects/${id}?year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setErr(data.error); return; }
        setD(data); setErr(null);
      })
      .catch(() => { if (!cancelled) setErr("Could not load it."); });
    return () => { cancelled = true; };
  }, [id, year]);

  // Drilling into a child keeps the previous answer on screen until the new one
  // lands. Rendering it would show the parent's figures under the child's name.
  const shown = d && d.object.id === id ? d : null;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const f = shown?.figures;
  const spent = f ? f.cogs + f.inventory + f.opex + f.development : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 fin" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto p-5"
             style={{ background: "var(--admin-bg)" }}
             onClick={(e) => e.stopPropagation()}>
        {err && <p className="fin-sub" style={{ color: "var(--viz-neg)" }}>{err}</p>}
        {!shown && !err && <p className="fin-sub py-10 text-center">Loading…</p>}

        {shown && (
          <div className="flex flex-col gap-4">
            <header className="flex items-start justify-between gap-4">
              <div>
                {shown.object.parentName && <div className="fin-label">{shown.object.parentName}</div>}
                <h2 className="text-[22px] font-semibold admin-heading" style={{ letterSpacing: "-.025em" }}>
                  {shown.object.name}
                </h2>
                <p className="fin-sub">{shown.object.kind} · {shown.year}{shown.plan ? ` · ${shown.plan.name}` : ""}</p>
              </div>
              <button onClick={onClose} className="fin-sub px-2 py-1">Close</button>
            </header>

            {shown.object.note && <p className="fin-sub">{shown.object.note}</p>}

            {/* every relation is a way out of here */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { onFilter(shown.object.id); onClose(); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold admin-btn-primary">
                Show only this
              </button>
              {shown.supplier && (
                <Link href="/admin/suppliers" className="px-3 py-1.5 rounded-lg text-xs border admin-input">
                  Made by {shown.supplier.name}{shown.supplier.country ? ` · ${shown.supplier.country}` : ""}
                </Link>
              )}
              {shown.product && (
                <Link href={`/admin/products/${shown.product.id}`} className="px-3 py-1.5 rounded-lg text-xs border admin-input">
                  Product · {shown.product.name}
                </Link>
              )}
            </div>

            {f && (
              <div className="fin-card !py-3.5">
                <div className="grid gap-x-5 gap-y-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))" }}>
                  <Stat label="Earns" value={eur0(f.revenue)} />
                  <Stat label="Costs" value={eur0(spent)} />
                  <Stat label="Difference" value={eur0(f.revenue - spent)} bad={f.revenue - spent < 0} />
                  {f.unitCost != null && <Stat label="One costs" value={eur2(f.unitCost)} hint={`${f.unitsBought} bought`} />}
                  {f.unitRevenue != null && <Stat label="One sells for" value={eur2(f.unitRevenue)} hint={`${f.unitsSold} sold`} />}
                  {f.unitMargin != null && <Stat label="Per unit" value={eur2(f.unitMargin)} bad={f.unitMargin < 0} />}
                </div>
              </div>
            )}

            {shown.children.length > 0 && (
              <Section title="What is under it">
                {shown.children.map((c) => (
                  <button key={c.id} onClick={() => onOpenObject(c.id)}
                          className="fin-row w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left">
                    <span className="text-[13px] fin-num flex-1 truncate">{c.name}</span>
                    <span className="fin-sub tabular-nums">
                      {c.figures && (c.figures.revenue || c.figures.cogs + c.figures.inventory)
                        ? `${eur0(c.figures.revenue)} in · ${eur0(c.figures.cogs + c.figures.inventory + c.figures.opex + c.figures.development)} out`
                        : "nothing allocated"}
                    </span>
                  </button>
                ))}
              </Section>
            )}

            {shown.milestones.length > 0 && (
              <Section title="What it is waiting on">
                {shown.milestones.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-2 py-1.5 text-[12.5px]">
                    <span className="fin-sub tabular-nums w-[5.5rem] shrink-0">{m.starts_on}</span>
                    <span className="admin-muted flex-1 truncate" title={m.title}>{m.title}</span>
                    {m.target_quantity != null && (
                      <span className="fin-num shrink-0">{Number(m.target_quantity)} {m.target_metric?.replace("_", " ")}</span>
                    )}
                    {m.amount_net != null && <span className="fin-sub tabular-nums shrink-0">{eur0(Number(m.amount_net))}</span>}
                  </div>
                ))}
              </Section>
            )}

            {shown.lines.length > 0 && (
              <Section title={`Budget lines · ${shown.lines.length}`}>
                {shown.lines.slice(0, 40).map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-2 py-1 text-[12.5px]">
                    <span className="fin-sub tabular-nums w-[4.5rem] shrink-0">{l.month.slice(0, 7)}</span>
                    <span className="admin-muted flex-1 truncate" title={l.label}>{l.label}</span>
                    {l.categoryName && <span className="fin-sub hidden sm:block truncate">{l.categoryName}</span>}
                    <span className="fin-num tabular-nums shrink-0">{eur0(Number(l.amount_net))}</span>
                  </div>
                ))}
                {shown.lines.length > 40 && <p className="fin-sub px-2 pt-1">and {shown.lines.length - 40} more.</p>}
              </Section>
            )}

            <Section title={shown.actuals.length ? `Actually booked · ${shown.actuals.length}` : "Actually booked"}>
              {shown.actuals.length === 0
                ? <p className="fin-sub px-2 py-1">Nothing recorded against this yet.</p>
                : shown.actuals.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-2 py-1 text-[12.5px]">
                    <span className="fin-sub tabular-nums w-[5.5rem] shrink-0">{a.incurred_on}</span>
                    <span className="admin-muted flex-1 truncate">{a.description}</span>
                    <span className="fin-sub shrink-0">{a.paid_on ? "paid" : "unpaid"}</span>
                    <span className="fin-num tabular-nums shrink-0">{eur0(Number(a.amount_net))}</span>
                  </div>
                ))}
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fin-card !py-3.5">
      <h3 className="fin-label mb-2">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Stat({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div>
      <div className="fin-label">{label}</div>
      <div className={`text-[17px] font-semibold tabular-nums mt-0.5 ${bad ? "text-red-400" : "fin-num"}`}
           style={{ letterSpacing: "-.02em" }}>{value}</div>
      {hint && <div className="fin-sub">{hint}</div>}
    </div>
  );
}
