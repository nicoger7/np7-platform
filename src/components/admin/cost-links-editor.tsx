"use client";

import { useEffect, useState } from "react";

type Edition = { id: string; label: string | null; year: number | null };
type Pay = { id: string; amount: number; date: string | null; reference: string | null; method: string | null; vendors: { name: string } | null };
type PayAlloc = { payment_id: string; amount: number; payment: Pay | null };
type Avail = Pay & { allocated: number; remaining: number };
type Links = {
  cost: { id: string; estimated_amount: number | null; actual_amount: number | null };
  editions: Edition[];
  editionAllocs: { edition_id: string; percent: number }[];
  paymentAllocs: PayAlloc[];
  available: Avail[];
  attachedTotal: number;
};

const eur = (n: number | null | undefined) => (n != null ? `€${Number(n).toLocaleString()}` : "—");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "");
const input = "w-full px-2.5 py-1.5 admin-input border rounded-lg text-[13px] focus:outline-none focus:border-[var(--admin-accent)]";
const label = "block text-[10px] font-bold tracking-[0.08em] admin-faint uppercase mb-1.5";

/** Attach actual expense payments to a cost (→ actual), split it across editions
 *  by %, and copy it to another edition. Lives in the cost detail pane. */
export function CostLinksEditor({ costId, onChange }: { costId: string; onChange?: () => void }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [attachId, setAttachId] = useState("");
  const [attachAmt, setAttachAmt] = useState("");
  const [pct, setPct] = useState<Record<string, string>>({});
  const [dupEd, setDupEd] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/admin/exp-costs/${costId}/links`)
      .then((r) => r.json())
      .then((d: Links) => {
        setLinks(d);
        const m: Record<string, string> = {};
        for (const a of d.editionAllocs || []) m[a.edition_id] = String(a.percent);
        setPct(m);
      })
      .catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [costId]);

  if (!links) return <div className="text-xs admin-faint py-3">Loading links…</div>;

  const avail = links.available.filter((a) => a.remaining > 0.01);
  const selectedAvail = avail.find((a) => a.id === attachId);
  const payLabel = (p: Pay | null) => p ? `${eur(p.amount)} · ${fmtDate(p.date)}${p.vendors?.name ? " · " + p.vendors.name : ""}${p.reference ? " · " + p.reference : ""}` : "—";

  async function attach() {
    if (!attachId) return;
    setBusy(true);
    await fetch(`/api/admin/exp-costs/${costId}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_id: attachId, amount: Number(attachAmt) || selectedAvail?.remaining || 0 }) });
    setBusy(false); setAttachId(""); setAttachAmt(""); load(); onChange?.();
  }
  async function detach(pid: string) { await fetch(`/api/admin/exp-costs/${costId}/payments?payment_id=${pid}`, { method: "DELETE" }); load(); onChange?.(); }
  async function saveSplit() {
    setBusy(true);
    const allocations = Object.entries(pct).map(([edition_id, p]) => ({ edition_id, percent: Number(p) || 0 })).filter((a) => a.percent > 0);
    await fetch(`/api/admin/exp-costs/${costId}/editions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allocations }) });
    setBusy(false); load(); onChange?.();
  }
  async function duplicate() {
    if (!dupEd) return;
    setBusy(true);
    await fetch(`/api/admin/exp-costs/${costId}/duplicate-to-edition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edition_id: dupEd }) });
    setBusy(false); setDupEd(""); onChange?.();
  }

  const pctTotal = Object.values(pct).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <div className="mt-5 space-y-5 border-t pt-5" style={{ borderColor: "var(--admin-border)" }}>
      {/* Actual from attached expense payments */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <span className={label}>Actual — from expense payments</span>
          <span className="text-sm font-bold text-green-400">{eur(links.attachedTotal || null)}{links.attachedTotal > 0 ? "" : ""}</span>
        </div>
        {links.paymentAllocs.length > 0 ? (
          <div className="space-y-1.5 mb-2">
            {links.paymentAllocs.map((a) => (
              <div key={a.payment_id} className="flex items-center justify-between gap-2 text-[13px] rounded-lg px-3 py-1.5 admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
                <span className="min-w-0 truncate">{eur(a.amount)} <span className="admin-faint">of {payLabel(a.payment)}</span></span>
                <button onClick={() => detach(a.payment_id)} className="shrink-0 text-[11px] admin-faint hover:text-red-400">Detach</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] admin-faint mb-2">No payments attached yet — the manual Actual field above is used until you attach real expenses.</p>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label className={label}>Attach an expense payment</label>
            <select className={input} value={attachId} onChange={(e) => { setAttachId(e.target.value); const a = avail.find((x) => x.id === e.target.value); setAttachAmt(a ? String(a.remaining) : ""); }}>
              <option value="">{avail.length ? "Pick a cost payment…" : "No unallocated cost payments"}</option>
              {avail.map((a) => <option key={a.id} value={a.id}>{payLabel(a)} — {eur(a.remaining)} free</option>)}
            </select>
          </div>
          <div className="w-24">
            <label className={label}>Amount</label>
            <input className={input} type="number" step="0.01" value={attachAmt} onChange={(e) => setAttachAmt(e.target.value)} placeholder="€" />
          </div>
          <button onClick={attach} disabled={!attachId || busy} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-[13px] font-bold rounded-lg">Attach</button>
        </div>
      </section>

      {/* Split across editions by % */}
      {links.editions.length > 1 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <span className={label}>Split across editions (%)</span>
            <span className={`text-[12px] font-semibold ${pctTotal > 100 ? "text-red-400" : "admin-faint"}`}>{pctTotal}% allocated{pctTotal > 100 ? " — over 100%!" : ""}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
            {links.editions.map((ed) => (
              <div key={ed.id} className="flex items-center gap-2">
                <span className="text-[12px] admin-muted truncate flex-1 min-w-0">{ed.label || ed.year}</span>
                <input className="w-16 px-2 py-1 admin-input border rounded text-[12px] text-right focus:outline-none focus:border-[var(--admin-accent)]" type="number" min="0" max="100" value={pct[ed.id] ?? ""} onChange={(e) => setPct({ ...pct, [ed.id]: e.target.value })} placeholder="%" />
              </div>
            ))}
          </div>
          <p className="text-[11px] admin-faint mb-2">Leave all empty to keep it on this cost&apos;s single edition (100%).</p>
          <button onClick={saveSplit} disabled={busy || pctTotal > 100} className="px-3 py-1.5 admin-surface text-[13px] font-semibold rounded-lg disabled:opacity-40" style={{ border: "1px solid var(--admin-border)" }}>Save split</button>
        </section>
      )}

      {/* Duplicate to another edition */}
      {links.editions.length > 0 && (
        <section>
          <span className={label}>Duplicate this cost to another edition</span>
          <div className="flex gap-2 items-center mt-1">
            <select className={`${input} flex-1`} value={dupEd} onChange={(e) => setDupEd(e.target.value)}>
              <option value="">Pick an edition…</option>
              {links.editions.map((ed) => <option key={ed.id} value={ed.id}>{ed.label || ed.year}</option>)}
            </select>
            <button onClick={duplicate} disabled={!dupEd || busy} className="px-3 py-1.5 admin-surface text-[13px] font-semibold rounded-lg disabled:opacity-40" style={{ border: "1px solid var(--admin-border)" }}>Copy here</button>
          </div>
        </section>
      )}
    </div>
  );
}
