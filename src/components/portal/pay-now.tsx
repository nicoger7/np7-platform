"use client";
import { useState } from "react";

/**
 * Pay the trip from the trip page.
 *
 * The bank transfer is still there, on the invoice, free and unhurried. This
 * is for the guest who would rather be done with it: one press, their own
 * bank's app or their card, and the money is on the booking before they have
 * closed the tab.
 *
 * What they are offered is decided by Stripe from their own country, so a
 * Dutch rider sees iDEAL and a German sees Wero without anyone choosing. No
 * card fee is ever added here.
 */
export function PayNow({ bookingId, amount, currency = "EUR", label }: {
  bookingId: string;
  amount: number;
  currency?: string;
  /** Overrides the default "Pay …" wording, e.g. for a securing payment. */
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

  async function go() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/portal/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) { setError(j.error || "Something went wrong. Please try again."); setBusy(false); return; }
      // Stripe's own page takes it from here; leave the button busy so a second
      // press cannot open a second checkout while the browser navigates.
      window.location.href = j.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (!(amount > 0)) return null;

  return (
    <div className="mt-4">
      <button
        onClick={go}
        disabled={busy}
        className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#00374a] hover:bg-[#00293a] disabled:opacity-60 text-white text-[14px] font-bold transition-colors"
      >
        {busy ? "Opening…" : (label ?? `Pay ${money} now`)}
      </button>
      <p className="text-[12px] text-[#7d8b91] mt-2">
        Your bank, iDEAL, Wero or card, whichever you use. Or ignore this and transfer from your invoice, both land in the same place.
      </p>
      {error && <p className="text-[12.5px] text-[#b4472a] mt-2">{error}</p>}
    </div>
  );
}
