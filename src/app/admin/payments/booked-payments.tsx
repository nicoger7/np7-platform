"use client";

/**
 * What was written down by hand, in three piles.
 *
 *   Unverified  typed since the NP7 GmbH switch, not yet asked of the feed.
 *               Each row arrives with the credits that could be it and the
 *               reasons; "This is it" ADOPTS the row onto the movement (the
 *               row gains the link and the bank label, no new money, and
 *               the movement leaves the to-match pile), "Mark off-bank" says
 *               the feed will never show it, and asks why.
 *   Off-bank    the rows that went through the back-door, each with its
 *               reason. Real money, not provable from the feed.
 *   Legacy      before the switch. History: read-only, kept for the booking
 *               balances, never in a total on this page, never a to-do.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { offBankMethodLabel } from "@/lib/bank/off-bank-methods";
import { useMailConfirm } from "@/components/admin/mail-confirm";

export type BookedView = "unverified" | "off_bank" | "legacy";

type QueueRow = {
  id: string;
  amount: number;
  type: string | null;
  direction: string | null;
  status: string | null;
  method: string | null;
  reference: string | null;
  on: string | null;
  notes: string | null;
  booking_id: string | null;
  document_id: string | null;
  guestName: string | null;
  guestEmail: string | null;
  invoiceNumber: string | null;
  experienceTitle: string | null;
  note?: string;
  suggestions: {
    transactionId: string;
    score: number;
    reasons: string[];
    confidence: "exact" | "strong" | "possible";
    transaction: { id: string; source: string; external_id: string; booked_on: string; amount: number; counterparty: string | null; reference: string | null; label: string | null; allocated?: number };
  }[];
};

type ListRow = {
  id: string;
  amount: number | null;
  direction: string | null;
  type: string | null;
  method: string | null;
  reference: string | null;
  date: string | null;
  received_at: string | null;
  created_at: string | null;
  status: string | null;
  notes: string | null;
  booking_id: string | null;
  off_bank_reason: string | null;
  possible_duplicate?: boolean;
  exp_bookings: { name: string; status: string } | null;
  contacts: { name: string } | null;
  vendors: { name: string } | null;
  exp_experiences: { title: string } | null;
};

const money = (n: number | string | null | undefined) =>
  `€${Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const when = (p: { date?: string | null; received_at?: string | null; created_at?: string | null }) => p.date ?? p.received_at ?? p.created_at ?? null;
const isOut = (p: { direction?: string | null; type?: string | null; amount?: number | string | null }) =>
  p.direction === "cost" ? Number(p.amount) >= 0 : p.type === "refund" || Number(p.amount) < 0;

export function BookedPayments({ view, onChanged }: { view: BookedView; onChanged: () => void }) {
  return view === "unverified" ? <UnverifiedQueue onChanged={onChanged} /> : <BookedList view={view} />;
}

/* ── Unverified: the queue ─────────────────────────────────────────────────── */

function UnverifiedQueue({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [allocationRows, setAllocationRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Adopting a row proves money the booking already had, which can cover an
     open payment request: the real invoice is issued and emailed to the guest
     on that click. It used to happen with nothing said. */
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [marking, setMarking] = useState<{ id: string; reason: string; method: string } | null>(null);
  // One dialog for every admin action that writes to a guest (Nico, 14 Sep 2026).
  const { ask: askMail, dialog: mailDialog } = useMailConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments?provenance=unverified&suggest=1");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the queue.");
      setRows(json.rows ?? []);
      setAllocationRows(json.allocationRows ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  // Deferred, as the feed does: the state lands in the callback, not in the
  // effect body.
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  /**
   * Adopting is the one action here that can write to a guest.
   *
   * It proves money the booking already had, and money that covers an open
   * payment request issues the real tax invoice and emails it. Marking a row
   * off-bank only re-labels it, so that one asks nothing.
   */
  async function adopt(r: QueueRow, transactionId: string) {
    const go = await askMail({
      title: `Adopt ${r.guestName ?? "this payment"} onto the bank movement`,
      mail: "The real invoice, if this money covers an open payment request",
      to: { kind: "person", name: r.guestName, email: r.guestEmail },
      attachment: "the invoice PDF",
      also: "No new money is written. If nothing is open on the booking, nothing is emailed either.",
      confirmLabel: "Adopt it",
    });
    if (!go) return;
    return act(r.id, { action: "adopt", transactionId });
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/payments/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "That did not work.");
      setError(null);
      setNote(json.promotionNote ? `Connected. ${json.promotionNote}` : null);
      setMarking(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading…</div>;

  return (
    <div>
      <p className="text-xs admin-muted mb-4 leading-relaxed">
        Typed by hand since NP7 GmbH started invoicing (4 August 2026) and not yet decided. Each row is either the same euro as a
        movement in the feed, in which case it is adopted onto it and no new money is written, or money the feed will never show,
        in which case it is marked off-bank with a reason. Nothing here is booked twice and nothing is decided without a click.
        {allocationRows > 0 && ` ${allocationRows} internal allocation row${allocationRows === 1 ? "" : "s"} (money moved between two bookings) ${allocationRows === 1 ? "is" : "are"} not listed: not money arriving.`}
      </p>
      {note && <div className="mb-4 text-sm text-green-600">{note}</div>}
      {error && <div className="mb-4 text-sm text-red-500">{error}</div>}
      {!rows.length ? (
        <div className="fin-card text-center py-10">
          <div className="fin-title mb-1">Nothing left to decide</div>
          <p className="fin-sub">Every hand-typed row since the switch is either bank-backed or off-bank with a reason.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const isMarking = marking?.id === r.id;
            return (
              <div key={r.id} className="fin-card">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className={`text-base font-semibold ${isOut(r) ? "text-red-500" : "text-green-600"}`}>{isOut(r) ? "−" : "+"}{money(r.amount)}</span>
                  <span className="text-sm">
                    {r.booking_id ? (
                      <Link href={`/admin/bookings/${r.booking_id}?tab=payments`} className="font-medium text-[var(--admin-accent)] hover:underline">{r.guestName ?? "Unnamed booking"}</Link>
                    ) : (
                      <span className="font-medium">{r.guestName ?? "No booking"}</span>
                    )}
                    {r.experienceTitle && <span className="admin-faint"> · {r.experienceTitle}</span>}
                  </span>
                  <span className="text-xs admin-faint">
                    {fmtDate(r.on)} · {r.type ?? "payment"} · {r.method || "no method"}{r.invoiceNumber ? ` · ${r.invoiceNumber}` : ""}{r.reference ? ` · ref ${r.reference}` : ""}
                  </span>
                  <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-500/15 admin-faint">unverified</span>
                </div>
                {r.notes && <p className="text-xs admin-faint mb-2 truncate">{r.notes}</p>}

                {r.suggestions.length ? (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {r.suggestions.map((s) => (
                      <div key={s.transactionId} className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                          s.confidence === "exact" ? "bg-green-500/15 text-green-600" : s.confidence === "strong" ? "bg-amber-500/15 text-amber-600" : "bg-slate-500/15 admin-faint"}`}>
                          {s.confidence}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {fmtDate(s.transaction.booked_on)} · +{money(Number(s.transaction.amount) - (s.transaction.allocated ?? 0))} · {s.transaction.counterparty || s.transaction.source}
                          </div>
                          <div className="fin-sub truncate">
                            {s.transaction.reference || s.transaction.label || s.transaction.external_id} · {s.reasons.join(" · ")}
                          </div>
                        </div>
                        <button
                          onClick={() => adopt(r, s.transactionId)}
                          disabled={busy === r.id}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50"
                          title="Link this row to the movement. No new money is written."
                        >
                          This is it
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm admin-faint mb-3">{r.note ?? "No unmatched credit in the feed matches this row."}</p>
                )}

                {isMarking ? (
                  <div className="p-3 rounded-xl" style={{ background: "var(--fin-inset)" }}>
                    <div className="fin-label mb-2">Why will this never be in the feed?</div>
                    <div className="grid sm:grid-cols-[1fr_180px_auto_auto] gap-2 items-center">
                      <input
                        className="admin-input text-sm px-3 py-1.5 rounded-lg w-full"
                        value={marking.reason}
                        onChange={(e) => setMarking({ ...marking, reason: e.target.value })}
                        placeholder="e.g. wired to the old Surfcenter account on 15 Aug"
                        autoFocus
                      />
                      <select className="admin-input text-sm px-3 py-1.5 rounded-lg w-full" value={marking.method} onChange={(e) => setMarking({ ...marking, method: e.target.value })}>
                        <option value="cash">Cash</option>
                        <option value="surfcenter">Wired to Surfcenter</option>
                        <option value="offset">Offset</option>
                        <option value="other">Other</option>
                      </select>
                      <button
                        onClick={() => act(r.id, { action: "mark-off-bank", reason: marking.reason.trim(), method: marking.method })}
                        disabled={busy === r.id || marking.reason.trim().length < 3}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/15 text-amber-600 disabled:opacity-50"
                        style={{ border: "1px solid rgba(245,158,11,.4)" }}
                      >
                        Mark off-bank
                      </button>
                      <button onClick={() => setMarking(null)} className="px-3 py-1.5 text-xs rounded-lg admin-muted">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setMarking({ id: r.id, reason: "", method: r.direction === "cost" ? "other" : "surfcenter" })}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 text-xs rounded-lg admin-surface admin-muted disabled:opacity-50"
                      style={{ border: "1px solid var(--admin-border)" }}
                      title="This money will never be in the feed. Say why."
                    >
                      Mark off-bank…
                    </button>
                    {r.booking_id && (
                      <Link href={`/admin/bookings/${r.booking_id}?tab=payments`} className="px-3 py-1.5 text-xs rounded-lg admin-muted hover:underline">
                        Open the booking
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {mailDialog}
    </div>
  );
}

/* ── Off-bank and Legacy: lists ────────────────────────────────────────────── */

function BookedList({ view }: { view: "off_bank" | "legacy" }) {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/payments?provenance=${view}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not load."); return j as ListRow[]; })
      .then((list) => {
        if (!live) return;
        list.sort((a, b) => (when(b) ?? "").localeCompare(when(a) ?? ""));
        setRows(list);
        setError(null);
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [view]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      `${p.reference ?? ""} ${p.notes ?? ""} ${p.off_bank_reason ?? ""} ${p.exp_bookings?.name ?? ""} ${p.contacts?.name ?? ""} ${p.vendors?.name ?? ""} ${p.exp_experiences?.title ?? ""}`.toLowerCase().includes(q));
  }, [rows, search]);

  // Off-bank money is real and counts; the legacy archive shows a count and
  // nothing else, because on the accounting level it does not exist here.
  const offBankTotal = useMemo(() => view === "off_bank"
    ? filtered.reduce((s, p) => s + (isOut(p) ? -1 : 1) * Math.abs(Number(p.amount) || 0), 0)
    : 0, [filtered, view]);

  function exportCsv() {
    const cols = ["date", "amount", "direction", "type", "method", "reference", "reason", "status", "linked"];
    const lines = filtered.map((p) => [
      when(p) ?? "", p.amount ?? "", p.direction ?? "", p.type ?? "", p.method ?? "",
      (p.reference ?? "").replace(/"/g, '""'), (p.off_bank_reason ?? "").replace(/"/g, '""'), p.status ?? "",
      (p.exp_bookings?.name ?? p.contacts?.name ?? p.vendors?.name ?? "").replace(/"/g, '""'),
    ]);
    const csv = [cols.join(","), ...lines.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `payments-${view}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading…</div>;

  return (
    <div>
      <p className="text-xs admin-muted mb-3 leading-relaxed">
        {view === "off_bank"
          ? "Money the feed will never show, recorded through the back-door with a reason. Real and counted toward the booking, not provable from the bank."
          : "Everything paid before NP7 GmbH invoiced (4 August 2026). Invoiced and settled in Surfcenter Experience's books. Kept for the booking balances and the trip pages; out of reconciliation, out of the feed, out of every total on this page. Read-only."}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, reference, reason…" className="admin-input text-sm px-3 py-1.5 rounded-lg w-64" />
        <button onClick={exportCsv} className="px-3 py-1.5 admin-surface admin-muted text-xs rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>Export CSV</button>
        <span className="text-xs admin-faint ml-auto">
          {filtered.length} row{filtered.length === 1 ? "" : "s"}
          {view === "off_bank" && filtered.length > 0 && <> · <span className={offBankTotal < 0 ? "text-red-500" : "text-amber-600"}>{offBankTotal < 0 ? "−" : ""}{money(offBankTotal)} off-bank</span></>}
          {view === "legacy" && " · archive, no totals"}
        </span>
      </div>
      {error && <div className="mb-4 text-sm text-red-500">{error}</div>}
      {!filtered.length ? (
        <div className="fin-card text-center py-10"><div className="fin-title mb-1">Nothing here</div><p className="fin-sub">{view === "off_bank" ? "No payment has gone through the back-door yet." : "No legacy rows match."}</p></div>
      ) : (
        <div className="admin-tablecard overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="fin-label px-4 py-3">Date</th>
                <th className="fin-label px-4 py-3 text-right">Amount</th>
                <th className="fin-label px-4 py-3">Who</th>
                <th className="fin-label px-4 py-3">{view === "off_bank" ? "How · why" : "Reference"}</th>
                <th className="fin-label px-4 py-3">Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="fin-rule">
                  <td className="px-4 py-2.5 whitespace-nowrap admin-muted">{fmtDate(when(p))}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${isOut(p) ? "text-red-500" : view === "legacy" ? "admin-muted" : "text-green-600"}`}>
                    {isOut(p) ? "−" : "+"}{money(p.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.booking_id && p.exp_bookings ? (
                      <Link href={`/admin/bookings/${p.booking_id}?tab=payments`} className="text-[var(--admin-accent)] hover:underline">{p.exp_bookings.name}</Link>
                    ) : (p.contacts?.name || p.vendors?.name || <span className="admin-faint">—</span>)}
                    {p.exp_experiences?.title && <span className="admin-faint"> · {p.exp_experiences.title}</span>}
                  </td>
                  <td className="px-4 py-2.5 admin-muted max-w-[360px]">
                    {view === "off_bank" ? (
                      <span className="block truncate" title={p.off_bank_reason ?? ""}>
                        <span className="px-1.5 py-0.5 mr-1.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-600">{offBankMethodLabel(p.method)}</span>
                        {p.off_bank_reason || "no reason recorded"}
                      </span>
                    ) : (
                      <span className="block truncate">
                        {p.reference || p.notes || "—"}
                        {p.possible_duplicate && <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 text-[9px] font-bold uppercase tracking-wide" title="Another row carries this reference for the same amount">dup?</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 admin-faint capitalize">{p.type ?? "—"}{p.status && p.status !== "paid" ? ` · ${p.status}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
