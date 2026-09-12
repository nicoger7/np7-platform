"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/invoices/types";

/**
 * The one place a tax invoice gets corrected.
 *
 * Reached from the booking's Documents tab, from the Invoices page, and (via
 * the booking) from the bookings list, so there is exactly one set of words
 * and one set of rules for what a Storno and a credit note are. The rules
 * themselves live server-side (generateCreditNote); this dialog asks the
 * preview endpoint what is possible before anyone presses anything, so a
 * refusal reads as a sentence on screen rather than as a failed request.
 *
 * Two acts, kept apart on purpose:
 *   STORNO       reverses the whole invoice. One click, then a confirmation
 *                in the same button, because it burns a number and the
 *                customer gets the paper.
 *   CREDIT NOTE  takes a stated amount off it. It cannot exceed what is left,
 *                and it is flagged for the Steuerberater, because a partial
 *                refund is a judgement case in the accounting plan.
 *
 * Neither moves money. A refund leaves the bank by hand and is logged under
 * Payments; the dialog says the figure so nobody has to work it out.
 */

type Preview = {
  original: {
    id: string;
    booking_id: string | null;
    invoice_number: string | null;
    type: string;
    typeLabel: string;
    amount: number;
    currency: string;
    issued_at: string | null;
    sent_at: string | null;
    paid_at: string | null;
  };
  canStorno: boolean;
  canCredit: boolean;
  blocker: string | null;
  credited: number;
  remaining: number;
  reversed: boolean;
  corrections: { id: string; invoice_number: string | null; amount: number | null; full: boolean }[];
  paidAgainst: number;
  refundableNow: number;
};

export type IssuedCorrection = {
  id: string;
  invoice_number: string | null;
  amount: number | null;
  currency: string;
  signedUrl: string | null;
  refund_due: number;
  full: boolean;
  original_invoice_number: string;
};

export type CorrectionMode = "storno" | "credit";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function CorrectionDialog({
  documentId,
  initialMode = "storno",
  onClose,
  onIssued,
}: {
  documentId: string;
  initialMode?: CorrectionMode;
  onClose: () => void;
  /** Called once a correction exists; the caller refreshes its list. */
  onIssued?: (doc: IssuedCorrection) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mode, setMode] = useState<CorrectionMode>(initialMode);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCorrection | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendErr, setSendErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/documents/${documentId}/credit-note`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setLoadErr(j.error || "Could not read this invoice."); return; }
        const p = j as Preview;
        setPreview(p);
        // Land on whichever act is still possible.
        if (initialMode === "storno" && !p.canStorno && p.canCredit) setMode("credit");
        if (initialMode === "credit" && !p.canCredit && p.canStorno) setMode("storno");
      })
      .catch(() => alive && setLoadErr("Could not read this invoice."));
    return () => { alive = false; };
  }, [documentId, initialMode]);

  const cur = preview?.original.currency ?? "EUR";
  const amountNum = Number(String(amount).replace(",", "."));
  const reasonOk = reason.trim().length >= 3;
  const creditOk = Number.isFinite(amountNum) && amountNum > 0 && !!preview && amountNum <= preview.remaining + 0.005;
  const canSubmit = !!preview && !preview.blocker && reasonOk && (mode === "storno" ? preview.canStorno : preview.canCredit && creditOk);
  const refundIfStorno = preview?.refundableNow ?? 0;
  const refundIfCredit = preview ? Math.min(Number.isFinite(amountNum) ? amountNum : 0, preview.refundableNow) : 0;

  async function submit() {
    if (!preview || !canSubmit) return;
    if (mode === "storno" && !armed) { setArmed(true); return; }
    setBusy(true); setErr(null);
    const res = await fetch(`/api/admin/documents/${documentId}/credit-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        ...(mode === "credit" ? { amount: Math.round(amountNum * 100) / 100 } : {}),
        reason: reason.trim(),
        bookingId: preview.original.booking_id ?? undefined,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || "Could not issue the correction."); setArmed(false); return; }
    const doc = j.document as IssuedCorrection;
    setIssued(doc);
    onIssued?.(doc);
  }

  async function sendToGuest() {
    if (!issued) return;
    setSendState("sending"); setSendErr(null);
    const res = await fetch(`/api/admin/documents/${issued.id}/send`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setSendState("sent");
    else { setSendState("failed"); setSendErr(j.error || "Could not send it."); }
  }

  const o = preview?.original;
  const inputClass = "w-full px-3 py-2 rounded-lg text-sm admin-input border";

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="fin w-full max-w-[480px] rounded-2xl p-6"
        style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-title"
      >
        {loadErr ? (
          <>
            <h3 id="correction-title" className="text-[15px] font-bold admin-heading">Correct invoice</h3>
            <p className="text-[13px] text-red-400 mt-3">{loadErr}</p>
            <div className="flex justify-end mt-5">
              <button onClick={onClose} className="px-4 py-2 text-sm admin-muted rounded-lg">Close</button>
            </div>
          </>
        ) : !preview || !o ? (
          <p className="text-sm admin-faint py-6 text-center">Reading the invoice…</p>
        ) : issued ? (
          /* ── Done: what exists now, and the two things a person does next ── */
          <>
            <h3 id="correction-title" className="text-[15px] font-bold admin-heading">
              {issued.full ? "Storno" : "Credit note"} {issued.invoice_number} issued
            </h3>
            <p className="text-[12.5px] admin-muted mt-1.5">
              {issued.full
                ? <>Invoice <span className="font-mono">{issued.original_invoice_number}</span> is reversed in full.</>
                : <>Invoice <span className="font-mono">{issued.original_invoice_number}</span> is reduced by {formatMoney(Math.abs(Number(issued.amount) || 0), cur)}.</>}
            </p>
            {issued.refund_due > 0 ? (
              <div className="mt-4 rounded-xl px-4 py-3" style={{ border: "1px solid rgb(245 158 11 / 0.5)", backgroundColor: "rgb(245 158 11 / 0.07)" }}>
                <div className="fin-label text-amber-500">Refund due</div>
                <div className="text-sm admin-heading mt-0.5">
                  {formatMoney(issued.refund_due, cur)} was paid against the corrected invoice. Transfer it back, then log it under Payments as a refund. Nothing moves by itself.
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] admin-faint mt-3">Nothing was paid against it, so no refund is due.</p>
            )}
            {!issued.full && (
              <p className="text-[12px] admin-faint mt-3">
                Partial correction: flagged for the Steuerberater before it is booked (accounting plan, section 12). The lexoffice push shows the same flag.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
              {issued.signedUrl && (
                <a href={issued.signedUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm admin-muted hover:admin-heading rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
                  Open PDF
                </a>
              )}
              <button
                onClick={sendToGuest}
                disabled={sendState === "sending" || sendState === "sent"}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50"
              >
                {sendState === "sent" ? "Sent to guest" : sendState === "sending" ? "Sending…" : "Send to guest"}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm admin-muted rounded-lg">Done</button>
            </div>
            {sendErr && <p className="text-[12px] text-red-400 mt-2 text-right">{sendErr}</p>}
          </>
        ) : (
          <>
            <h3 id="correction-title" className="text-[15px] font-bold admin-heading">
              Correct invoice <span className="font-mono">{o.invoice_number}</span>
            </h3>
            <p className="text-[12.5px] admin-faint mt-1">
              {o.typeLabel} · {formatMoney(o.amount, cur)} · issued {fmtDate(o.issued_at) ?? "?"}
              {o.sent_at ? ` · sent ${fmtDate(o.sent_at)}` : " · not sent"}
              {preview.paidAgainst > 0 ? ` · ${formatMoney(preview.paidAgainst, cur)} paid` : " · unpaid"}
            </p>

            {preview.blocker ? (
              <>
                <p className="text-[13px] mt-4 px-3 py-2.5 rounded-lg text-amber-500" style={{ border: "1px solid rgb(245 158 11 / 0.4)", backgroundColor: "rgb(245 158 11 / 0.07)" }}>
                  {preview.blocker}
                </p>
                <div className="flex justify-end mt-5">
                  <button onClick={onClose} className="px-4 py-2 text-sm admin-muted rounded-lg">Close</button>
                </div>
              </>
            ) : (
              <>
                {preview.credited > 0 && (
                  <p className="text-[12px] admin-muted mt-2">
                    Already credited: {formatMoney(preview.credited, cur)} ({preview.corrections.map((c) => c.invoice_number).filter(Boolean).join(", ")}). {formatMoney(preview.remaining, cur)} left.
                  </p>
                )}

                <div className="fin-seg mt-4" role="tablist" aria-label="Kind of correction">
                  <button type="button" role="tab" data-on={mode === "storno"} aria-selected={mode === "storno"} disabled={!preview.canStorno}
                    onClick={() => { setMode("storno"); setArmed(false); }} style={!preview.canStorno ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
                    Storno
                  </button>
                  <button type="button" role="tab" data-on={mode === "credit"} aria-selected={mode === "credit"} disabled={!preview.canCredit}
                    onClick={() => { setMode("credit"); setArmed(false); }} style={!preview.canCredit ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
                    Credit note
                  </button>
                </div>

                {mode === "storno" ? (
                  <div className="mt-3">
                    <p className="text-[13px] admin-heading">
                      Reverses the whole invoice: <strong>−{formatMoney(o.amount, cur)}</strong>. A Stornorechnung with its own number, referencing {o.invoice_number}.
                    </p>
                    <p className="text-[12px] admin-faint mt-1.5">
                      {refundIfStorno > 0
                        ? <>Refund due afterwards: <strong className="admin-muted">{formatMoney(refundIfStorno, cur)}</strong> (already paid). You transfer it and log it under Payments.</>
                        : "Nothing has been paid against it, so no refund follows."}
                      {!o.sent_at && " This invoice was never sent; if nobody has it, \"Cancel unsent\" is the lighter fix."}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <label className="block text-[12px] font-bold admin-muted mb-1">Amount to credit ({cur})</label>
                    <input
                      type="number" min="0.01" step="0.01" max={preview.remaining}
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                      placeholder={`up to ${preview.remaining.toFixed(2)}`}
                      className={inputClass} style={{ borderColor: "var(--admin-border)" }}
                    />
                    {amount && !creditOk && (
                      <p className="text-[12px] text-red-400 mt-1">
                        {amountNum > preview.remaining + 0.005
                          ? `Only ${formatMoney(preview.remaining, cur)} is left on this invoice. To reverse all of it, use Storno.`
                          : "Enter a positive amount."}
                      </p>
                    )}
                    <p className="text-[12px] admin-faint mt-1.5">
                      A Rechnungskorrektur taking this amount off {o.invoice_number}; the rest of the invoice stands.
                      {refundIfCredit > 0 && <> Refund due afterwards: <strong className="admin-muted">{formatMoney(refundIfCredit, cur)}</strong>.</>}
                    </p>
                    <p className="text-[12px] mt-1.5 text-amber-500">
                      Partial corrections are flagged for the Steuerberater before they are booked.
                    </p>
                  </div>
                )}

                <label className="block text-[12px] font-bold admin-muted mt-4 mb-1">Reason (printed on the document)</label>
                <input
                  value={reason} onChange={(e) => { setReason(e.target.value); setArmed(false); }}
                  placeholder={mode === "storno" ? "e.g. booking cancelled by the guest on 12 Sep" : "e.g. goodwill reduction, room downgrade"}
                  className={inputClass} style={{ borderColor: "var(--admin-border)" }}
                />
                {err && <p className="text-[12px] text-red-400 mt-2">{err}</p>}

                <div className="flex items-center justify-end gap-2 mt-5">
                  <button onClick={onClose} className="px-4 py-2 text-sm admin-muted rounded-lg">Cancel</button>
                  <button
                    onClick={submit}
                    disabled={!canSubmit || busy}
                    className={`px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-40 ${armed ? "bg-red-500 text-white" : "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"}`}
                  >
                    {busy ? "Issuing…"
                      : mode === "storno"
                        ? (armed ? `Yes, reverse ${o.invoice_number}` : "Issue Storno…")
                        : "Issue credit note"}
                  </button>
                </div>
                {armed && mode === "storno" && (
                  <p className="text-[11.5px] admin-faint mt-2 text-right">This burns the next invoice number and cannot be undone. Click again to confirm.</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
