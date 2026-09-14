"use client";

import { useEffect, useState } from "react";
import { mutate, saved } from "@/lib/mutate";
import { useMailConfirm, type MailAudience } from "@/components/admin/mail-confirm";

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
  // One dialog for every admin action that writes to a guest (Nico, 14 Sep 2026).
  const { ask: askMail, dialog: mailDialog } = useMailConfirm();

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
    /* One click here writes to TWO groups with two different mails, and the
       old confirm described the money without ever saying an email leaves.
       The counts come from the server so the dialog names real people, not
       "riders who picked it". */
    const split = await fetch(`/api/admin/events/confirm-date?experienceId=${experienceId}&dateId=${id}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const toPay = Number(split?.toPayBalance ?? 0);
    const refund = Number(split?.refunded ?? 0);
    const to: MailAudience[] = [];
    if (toPay > 0) to.push({ kind: "people", count: toPay, describe: "riders who picked this date, a pay-balance link" });
    if (refund > 0) to.push({ kind: "people", count: refund, describe: "standbys on the other dates, a refund notice" });
    if (!to.length) to.push({ kind: "none", why: "no deposit-paid standby is waiting on this event" });
    const go = await askMail({
      title: `Confirm "${human}"`,
      mail: toPay && refund ? "Two mails, one per group" : toPay ? "Event date confirmed, balance due" : "Event date not running, refund notice",
      to,
      also: "Riders who could not make it are refunded and their booking moves to Lost. This can't be undone.",
      confirmLabel: "Confirm the date",
    });
    if (!go) return;
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
      {mailDialog}
    </div>
  );
}
