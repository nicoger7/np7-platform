"use client";
import { useEffect, useState } from "react";
import { CARD_REGIONS, cardFee, type CardRegion } from "@/lib/card-fee";

/**
 * Pay by card, on request.
 *
 * Bank transfer is the default and free. This makes a Stripe Checkout link for
 * one booking when a guest asks to pay by card: the admin names the amount,
 * says which card family it is for, and the card cost is added only where the
 * law allows it (lib/card-fee). The guest gets the link by whatever channel
 * the conversation is in; the webhook records the money when it lands.
 */
type Link = {
  id: string; amount: number; fee: number; total: number; currency: string; card_region: string;
  status: "open" | "paid" | "expired" | "cancelled"; url: string | null; note: string | null;
  created_at: string; expires_at: string | null; paid_at: string | null;
};

const money = (n: number, c = "EUR") => `${c === "EUR" ? "€" : c + " "}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export function CardLinkDialog({ bookingId, suggestedAmount, outstanding: outstandingHint, currency: currencyHint = "EUR", onClose, onChanged }: {
  bookingId: string; suggestedAmount: number; outstanding: number; currency?: string; onClose: () => void; onChanged: () => void;
}) {
  const [amount, setAmount] = useState(String(suggestedAmount > 0 ? suggestedAmount : outstandingHint));
  // No fee is the safe default: a fee is only right when you KNOW the card.
  const [region, setRegion] = useState<CardRegion>("eea");
  // The API's own figures win over the page's hints: the same owed rule the
  // route enforces, and the booking's real currency.
  const [outstanding, setOutstanding] = useState(outstandingHint);
  const [currency, setCurrency] = useState(currencyHint);
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<Link[]>([]);
  const [configured, setConfigured] = useState(true);
  const [redacted, setRedacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const read = () => fetch(`/api/admin/bookings/${bookingId}/payments/card-link`).then((x) => x.json()).catch(() => null);
  const apply = (r: { links?: Link[]; configured?: boolean; outstanding?: number; currency?: string; money_redacted?: boolean } | null) => {
    if (r?.links) setLinks(r.links);
    if (r && typeof r.configured === "boolean") setConfigured(r.configured);
    if (r && typeof r.outstanding === "number") setOutstanding(r.outstanding);
    if (r?.currency) setCurrency(r.currency);
    if (r?.money_redacted) { setRedacted(true); setMsg("Your role cannot see money on bookings, so it cannot make payment links."); }
  };
  const load = () => read().then(apply);
  useEffect(() => {
    let alive = true;
    read().then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const amt = Number(String(amount).replace(",", "."));
  const valid = Number.isFinite(amt) && amt > 0 && amt <= outstanding + 0.01;
  const { fee, total } = cardFee(valid ? amt : 0, region);
  const info = CARD_REGIONS.find((r) => r.key === region)!;

  async function create() {
    if (!valid) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/bookings/${bookingId}/payments/card-link`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, cardRegion: region, note }),
      });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Could not create the link."); return; }
      setMsg(null);
      await load(); onChanged();
      copy(j.link.url, j.link.id, true);
    } catch { setMsg("Could not create the link."); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    if (!confirm("Cancel this link? The guest can no longer pay with it.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/bookings/${bookingId}/payments/card-link?linkId=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) setMsg(j.error || "Could not cancel the link.");
      await load(); onChanged();
    } finally { setBusy(false); }
  }
  function copy(url: string | null, id: string, afterCreate = false) {
    if (!url) return;
    // Safari refuses the clipboard outside a click; say so instead of silence.
    const fallback = () => { if (afterCreate) setMsg("Link created. Copy it from the list below."); };
    if (!navigator.clipboard) { fallback(); return; }
    navigator.clipboard.writeText(url).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); }).catch(fallback);
  }

  const input = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]";
  const label = "block text-[11px] font-bold admin-faint uppercase tracking-wide mb-1";
  const tone = (s: Link["status"]) => s === "paid" ? "bg-green-500/15 text-green-400" : s === "open" ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "bg-slate-500/15 admin-muted";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,10,16,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-2xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", boxShadow: "var(--admin-shadow)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Pay by card, on request</div>
            <div className="text-base font-bold admin-heading">Card payment link</div>
            <p className="text-xs admin-muted mt-1 max-w-[52ch]">Bank transfer stays the free default. This link is for the guest who asks for a card; the fee is Stripe’s own cost and only where a surcharge is allowed.</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none admin-faint hover:admin-heading">×</button>
        </div>

        {!configured && <p className="text-xs text-red-400 mb-3">Stripe is not configured on this deployment; links cannot be created here.</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={label}>Amount to credit the trip ({currency})</label>
            <input className={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <p className="text-[11px] admin-faint mt-1">{money(outstanding, currency)} still owed on this booking.</p>
          </div>
          <div>
            <label className={label}>The guest’s card</label>
            <select className={input} value={region} onChange={(e) => setRegion(e.target.value as CardRegion)}>
              {CARD_REGIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11.5px] admin-muted mb-1">{info.note}</p>
        <p className="text-[11.5px] text-amber-400 mb-3">The fee is charged on whatever card is used with this link. Pick a fee bucket only when you know the card is that kind; when in doubt, leave it at no fee.</p>

        <div className="rounded-xl p-3 mb-3 text-sm" style={{ backgroundColor: "var(--admin-surface-hover)", border: "1px solid var(--admin-border)" }}>
          <div className="flex justify-between"><span className="admin-muted">Trip is credited</span><span className="admin-heading font-medium">{valid ? money(amt, currency) : "—"}</span></div>
          <div className="flex justify-between"><span className="admin-muted">Card fee on top</span><span className={fee > 0 ? "text-amber-400 font-medium" : "admin-faint"}>{valid ? (fee > 0 ? `+ ${money(fee, currency)}` : "none") : "—"}</span></div>
          <div className="flex justify-between mt-1 pt-1" style={{ borderTop: "1px solid var(--admin-border)" }}><span className="admin-heading font-bold">Guest pays</span><span className="admin-heading font-bold">{valid ? money(total, currency) : "—"}</span></div>
        </div>

        <div className="mb-3">
          <label className={label}>Note (why a card, for the file)</label>
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. asked for a card link on WhatsApp, Canadian bank" />
        </div>
        {msg && <p className="text-xs text-red-400 mb-2">{msg}</p>}
        <p className="text-[11px] admin-faint mb-2">A link stays open for 24 hours; after that make a new one. Bank transfer is always offered free beside it.</p>
        <div className="flex gap-2 mb-4">
          <button onClick={create} disabled={!valid || busy || !configured || redacted}
            title={!valid ? "Amount must be above zero and not more than what is owed" : undefined}
            className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg">
            {busy ? "Working…" : "Create link and copy"}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 admin-muted text-xs rounded-lg">Close</button>
        </div>

        {links.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1.5">Links on this booking</div>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              {links.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs" style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined }}>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tone(l.status)}`}>{l.status}</span>
                  <span className="min-w-0 flex-1 truncate admin-heading">
                    {money(l.amount, l.currency)}{l.fee > 0 ? <span className="admin-faint"> + {money(l.fee, l.currency)} fee</span> : null}
                    <span className="admin-faint"> · {l.status === "paid" ? `paid ${when(l.paid_at)}` : l.status === "open" ? `valid until ${when(l.expires_at)}` : `made ${when(l.created_at)}`}{l.note ? ` · ${l.note}` : ""}</span>
                  </span>
                  {l.status === "open" && l.url && (
                    <>
                      <button onClick={() => copy(l.url, l.id)} className="shrink-0 font-bold text-[#0aa3c7] hover:underline">{copied === l.id ? "Copied" : "Copy"}</button>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-bold text-[#0aa3c7] hover:underline">Open</a>
                      <button onClick={() => cancel(l.id)} disabled={busy} className="shrink-0 admin-faint hover:text-red-400">Cancel</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
