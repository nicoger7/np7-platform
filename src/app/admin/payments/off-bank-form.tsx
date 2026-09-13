"use client";

/**
 * The back-door.
 *
 * Money that will never be in the feed: cash at the centre, a transfer that
 * landed on the old Surfcenter account, an amount netted against something
 * else. Recorded against a booking (and an invoice, when one is open), with
 * a reason the table will not take the row without (migration 235). The row
 * is labelled off-bank and carries that reason wherever it shows.
 *
 * A transfer to NP7's own account is never typed here: it is in the feed,
 * and connecting it there is what books it.
 */
import { useEffect, useMemo, useState } from "react";
import { mutate } from "@/lib/mutate";
import { parseAmount, formatAmount } from "@/lib/parse-amount";
import { OFF_BANK_METHODS } from "@/lib/bank/off-bank-methods";

type BookingOption = {
  id: string;
  name: string | null;
  status: string | null;
  contact?: { name: string | null } | null;
  experience?: { title: string | null } | null;
  edition?: { label: string | null; year: number | null } | null;
};

type Invoice = {
  id: string;
  type: string;
  invoice_number: string | null;
  amount: number | null;
  status: string;
  paid_at: string | null;
  readOnly?: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

export function OffBankForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [query, setQuery] = useState("");
  const [bookingId, setBookingId] = useState("");
  // Keyed by the booking they were read for, so a change of booking shows no
  // stale list while the next read is in flight, and no effect has to clear it.
  const [invoicesFor, setInvoicesFor] = useState<{ bookingId: string; list: Invoice[] } | null>(null);
  const invoices = invoicesFor?.bookingId === bookingId ? invoicesFor.list : [];
  const [form, setForm] = useState({ amount: "", date: today(), method: "cash", reason: "", documentId: "", refund: false, notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/bookings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setBookings((j?.bookings ?? []) as BookingOption[]))
      .catch(() => setBookings([]));
  }, []);

  // The booking's own invoices, so the money can name what it settles.
  useEffect(() => {
    if (!bookingId) return;
    let live = true;
    fetch(`/api/admin/bookings/${bookingId}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        const docs = ((j?.documents ?? []) as Invoice[]).filter((d) => d.status === "issued" && !d.readOnly && /invoice/.test(d.type) && d.type !== "credit_note");
        setInvoicesFor({ bookingId, list: docs });
      })
      .catch(() => { if (live) setInvoicesFor({ bookingId, list: [] }); });
    return () => { live = false; };
  }, [bookingId]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return bookings
      .filter((b) => [b.name, b.contact?.name, b.experience?.title, b.edition?.label, b.edition?.year ? String(b.edition.year) : ""].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 12);
  }, [bookings, query]);
  const chosen = bookings.find((b) => b.id === bookingId) ?? null;

  const amount = parseAmount(form.amount);
  const canSave = !busy && !!bookingId && amount !== null && amount > 0 && form.reason.trim().length >= 3;

  async function save() {
    if (!canSave) return;
    setBusy(true); setError(null);
    const r = await mutate(`/api/admin/payments`, {
      method: "POST",
      body: {
        bookingId,
        documentId: form.documentId || null,
        amount,
        date: form.date,
        method: form.method,
        reason: form.reason.trim(),
        refund: form.refund,
        notes: form.notes || null,
      },
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone();
  }

  const input = "admin-input text-sm px-3 py-1.5 rounded-lg w-full";
  const label = "fin-label mb-1 block";

  return (
    <div className="fin-card mb-5" style={{ borderColor: "rgba(245,158,11,.4)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-500">Off-bank</span>
        <span className="fin-title">Money the feed will never show</span>
      </div>
      <p className="text-xs admin-muted mb-4 leading-relaxed">
        Cash, a transfer that landed on the old Surfcenter account, an amount offset against something else. The row is not
        bank-backed, says so wherever it shows, and carries your reason. A transfer to NP7&apos;s own account is never typed here:
        find it in the feed and connect it.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={label}>Whose money</label>
          {chosen ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{chosen.name || chosen.contact?.name || chosen.id.slice(0, 8)}</span>
              <span className="admin-faint">· {[chosen.experience?.title, chosen.edition?.label].filter(Boolean).join(" · ") || "no trip"}</span>
              <button onClick={() => { setBookingId(""); setForm((f) => ({ ...f, documentId: "" })); }} className="text-xs admin-faint hover:admin-muted">change</button>
            </div>
          ) : (
            <>
              <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guest, trip…" autoFocus />
              {query.trim() && (
                <div className="mt-1 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                  {hits.map((b) => (
                    <button key={b.id} onClick={() => { setBookingId(b.id); setQuery(""); }} className="fin-row text-left px-3 py-1.5 rounded-lg text-sm">
                      <span className="font-medium">{b.name || b.contact?.name || b.id.slice(0, 8)}</span>
                      <span className="admin-faint"> · {[b.experience?.title, b.edition?.label, b.status].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                  {!hits.length && <span className="text-xs admin-faint px-3 py-1">{bookings.length ? "No booking matches that." : "Loading bookings…"}</span>}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className={label}>Apply to invoice</label>
          <select className={input} value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })} disabled={!bookingId}>
            <option value="">{bookingId ? (invoices.length ? "— Not assigned —" : "No open invoice on this booking") : "Pick the booking first"}</option>
            {invoices.map((d) => (
              <option key={d.id} value={d.id}>{d.invoice_number || d.type.replace(/_/g, " ")} · €{Number(d.amount ?? 0).toLocaleString()}{d.paid_at ? " (paid)" : ""}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <label className={label}>Amount (€) *</label>
          <input className={input} type="text" inputMode="decimal" placeholder="3.845 or 3845" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          {form.amount.trim() !== "" && (amount === null
            ? <p className="text-[11px] text-amber-500 mt-1">Not a number</p>
            : <p className="text-[11px] admin-faint mt-1">Records €{formatAmount(amount)}</p>)}
        </div>
        <div>
          <label className={label}>Arrived on</label>
          <input className={input} type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <label className={label}>How</label>
          <select className={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {OFF_BANK_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-xs admin-muted cursor-pointer select-none">
          <input type="checkbox" checked={form.refund} onChange={(e) => setForm({ ...form, refund: e.target.checked })} className="accent-amber-500" />
          A refund, money back to the guest
        </label>
      </div>
      <p className="text-xs admin-faint -mt-2 mb-4">{OFF_BANK_METHODS.find((m) => m.key === form.method)?.blurb}</p>

      <div className="grid sm:grid-cols-[2fr_1fr] gap-4 mb-4">
        <div>
          <label className={label}>Why is this not in the bank feed? *</label>
          <input className={input} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. paid cash at the centre on the last day, receipt in the trip folder" />
        </div>
        <div>
          <label className={label}>Notes</label>
          <input className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={!canSave}
          title={!bookingId ? "Pick the booking first" : amount === null || amount <= 0 ? "Type an amount" : form.reason.trim().length < 3 ? "The reason is required" : undefined}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          {busy ? "Recording…" : "Record off-bank"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
      </div>
    </div>
  );
}
