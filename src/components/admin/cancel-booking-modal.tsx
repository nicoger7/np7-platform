"use client";

import { useState } from "react";

export type CancelInitiator = "customer" | "np7";

/**
 * Cancelling a booking is two different events wearing one button.
 *
 *   · the CUSTOMER asked  → we confirm it, and the confirmation email is the
 *     right thing to send
 *   · WE cancelled        → no-show, non-payment, we pulled the trip. The reason
 *     belongs on the record, and the customer has usually already been told by
 *     phone, so mailing them a template is often wrong
 *
 * The old flow had one path labelled "Confirm cancellation", so an NP7-side
 * cancellation was filed in the notes as though the customer had requested it —
 * the wrong paper trail if it's ever disputed. It also fired a real email from
 * behind a single browser confirm(): `cancellation_confirmed` is on the
 * soft-launch allowlist, so it sends for real today.
 *
 * Hence: pick who cancelled, say why when it's us, and see exactly what will (or
 * won't) be emailed before anything happens.
 */
export function CancelBookingModal({
  bookingName,
  onClose,
  onConfirm,
}: {
  bookingName: string;
  onClose: () => void;
  onConfirm: (args: { initiator: CancelInitiator; reason: string; sendEmail: boolean }) => Promise<void>;
}) {
  const [initiator, setInitiator] = useState<CancelInitiator | null>(null);
  // Default the email to ON only for a customer request, where a confirmation is
  // expected. When WE cancel, silence is the safer default — you've likely called.
  const [sendEmail, setSendEmail] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const needsReason = initiator === "np7";
  const ready = initiator !== null && (!needsReason || reason.trim().length >= 3);

  function pick(next: CancelInitiator) {
    setInitiator(next);
    setSendEmail(next === "customer");
  }

  const card = (active: boolean) =>
    `flex-1 text-left rounded-xl p-3.5 transition-colors border ${
      active ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/10" : "admin-surface"
    }`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[520px] rounded-2xl p-5"
        style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border)" }}>
        <h2 className="text-lg font-bold admin-heading">Cancel this booking</h2>
        <p className="text-xs admin-faint mt-0.5 mb-4">{bookingName}</p>

        <label className="text-[11px] font-bold uppercase tracking-[0.1em] admin-faint">Who cancelled?</label>
        <div className="flex gap-2.5 mt-2 mb-4">
          <button type="button" onClick={() => pick("customer")} className={card(initiator === "customer")}
            style={initiator === "customer" ? undefined : { borderColor: "var(--admin-border)" }}>
            <span className="block text-[13px] font-bold admin-heading">The customer asked</span>
            <span className="block text-[11px] admin-faint mt-0.5">They requested it — we confirm.</span>
          </button>
          <button type="button" onClick={() => pick("np7")} className={card(initiator === "np7")}
            style={initiator === "np7" ? undefined : { borderColor: "var(--admin-border)" }}>
            <span className="block text-[13px] font-bold admin-heading">We cancelled</span>
            <span className="block text-[11px] admin-faint mt-0.5">No-show, non-payment, trip pulled.</span>
          </button>
        </div>

        {needsReason && (
          <div className="mb-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em] admin-faint">Reason <span className="text-red-400">*</span></label>
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. balance unpaid after three reminders"
              className="w-full mt-1.5 px-3 py-2 rounded-lg text-sm admin-input border"
              style={{ borderColor: "var(--admin-border)" }} />
            <p className="text-[11px] admin-faint mt-1">Goes on the booking record — it&apos;s what you&apos;ll read back in six months.</p>
          </div>
        )}

        {initiator && (
          <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--admin-accent)]" />
            <span className="text-[12.5px] admin-muted">
              Email the customer
              <span className="block text-[11px] admin-faint">
                {sendEmail
                  ? "Sends the “Your cancellation” template now. This one is live — it is not held back by the soft launch."
                  : "Nothing is sent. The booking is still cancelled and the record still stamped."}
              </span>
            </span>
          </label>
        )}

        <div className="rounded-lg px-3 py-2 mb-4 text-[11.5px] admin-muted" style={{ backgroundColor: "var(--admin-surface)" }}>
          The booking moves to <b className="admin-heading">Lost</b>. Refunds and credits are handled separately — nothing is refunded here.
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-sm admin-muted">Keep booking</button>
          <button
            type="button"
            disabled={!ready || busy}
            title={!initiator ? "Pick who cancelled" : needsReason && !reason.trim() ? "Add a reason" : undefined}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm({ initiator: initiator!, reason: reason.trim(), sendEmail }); }
              finally { setBusy(false); }
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white transition-colors"
          >
            {busy ? "Cancelling…" : "Cancel booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
