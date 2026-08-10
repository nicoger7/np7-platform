"use client";

import { useEffect, useState } from "react";
import { mutate, saved } from "@/lib/mutate";

type Row = { id: string; date_start: string; date_end: string | null; label: string | null; status: string; sort_order: number };

/**
 * Candidate/confirmed dates for an event. For standby events each candidate
 * shows a "Confirm this date" action, which settles every deposit (collects
 * balances from available riders, refunds the rest).
 */
export function EventDatesEditor({ experienceId, mode }: { experienceId: string; mode: "fixed" | "standby" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => fetch(`/api/admin/event-dates?experienceId=${experienceId}`).then((r) => r.json()).then((d) => setRows(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [experienceId]);

  async function add() {
    if (!start) return;
    setBusy(true);
    // The inputs used to be cleared unconditionally: a rejected POST looked exactly
    // like a saved one, so the candidate date riders are asked to vote on was never
    // created — and the admin, seeing empty fields, had no reason to re-enter it.
    const ok = await saved(mutate("/api/admin/event-dates", { method: "POST", body: { experienceId, date_start: start, date_end: end || null, label: label || null } }));
    setBusy(false);
    if (!ok) return;
    setStart(""); setEnd(""); setLabel(""); load();
  }
  async function remove(id: string) {
    // A failed DELETE was followed by a reload that quietly put the row back, so a
    // date the admin had withdrawn stayed live on the event page and kept taking
    // standby deposits for a slot nobody intended to run.
    if (!(await saved(mutate(`/api/admin/event-dates?id=${id}`, { method: "DELETE" })))) return;
    load();
  }
  async function confirm(id: string, human: string) {
    if (!window.confirm(`Confirm "${human}"? Riders who picked it will be asked to pay the balance; everyone else gets the standby refund. This can't be undone.`)) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/events/confirm-date", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experienceId, dateId: id }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg(`Confirmed. ${j.toPayBalance} to pay balance · ${j.refunded} refunded${j.refundErrors ? ` · ${j.refundErrors} refund error(s)` : ""}.`); load(); }
    else setMsg(j.error || "Failed to confirm.");
  }

  const fmt = (r: Row) => {
    const s = new Date(r.date_start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const e = r.date_end ? ` – ${new Date(r.date_end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "";
    return `${r.label ? r.label + " · " : ""}${s}${e}`;
  };

  return (
    <div>
      {loading ? <p className="text-sm admin-faint">Loading dates…</p> : (
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm admin-faint">No dates yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 ${r.status === "confirmed" ? "border-[#1f7a45]/40 bg-[#eafaf0]" : r.status === "cancelled" ? "border-[var(--admin-border)] opacity-55" : "border-[var(--admin-border)]"}`}>
              <span className="text-sm admin-heading flex-1">{fmt(r)}</span>
              {r.status === "confirmed" && <span className="text-[11px] font-bold uppercase tracking-wide text-[#1f7a45]">Confirmed ✓</span>}
              {r.status === "cancelled" && <span className="text-[11px] font-bold uppercase tracking-wide admin-faint">Didn&apos;t run</span>}
              {r.status === "candidate" && (
                <>
                  {mode === "standby" && (
                    <button type="button" disabled={busy} onClick={() => confirm(r.id, fmt(r))} className="text-[12px] font-bold text-[#1f7a45] hover:underline disabled:opacity-50">Confirm this date</button>
                  )}
                  <button type="button" onClick={() => remove(r.id)} className="text-[12px] font-semibold text-[#c0392b] hover:underline">Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {msg && <p className="mt-3 text-[13px] font-semibold admin-heading">{msg}</p>}

      {/* add a date */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block"><span className="block text-xs admin-muted mb-1">Start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="admin-input px-3 py-2 rounded-lg border text-sm outline-none" /></label>
        <label className="block"><span className="block text-xs admin-muted mb-1">End <span className="admin-faint">(optional)</span></span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="admin-input px-3 py-2 rounded-lg border text-sm outline-none" /></label>
        <label className="block"><span className="block text-xs admin-muted mb-1">Label <span className="admin-faint">(optional)</span></span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Option A" className="admin-input px-3 py-2 rounded-lg border text-sm outline-none w-40" /></label>
        <button type="button" onClick={add} disabled={!start || busy} className="rounded-lg bg-[var(--admin-accent)] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50">Add date</button>
      </div>
    </div>
  );
}
