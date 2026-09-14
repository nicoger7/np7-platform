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
 * What they are offered is decided by their country, in payment-methods.ts,
 * and the decision is made on the server so this button never opens a checkout
 * the guest cannot finish. Where their country has no instant rail the button
 * does not appear at all and the bank transfer below it is the answer.
 */
export function PayNow({ bookingId, amount, balance, refundableUntil, currency = "EUR", label, methods }: {
  bookingId: string;
  amount: number;
  /** Everything still owed. When it is more than `amount`, paying the lot is
   *  offered beside the milestone: some people would rather be done with it. */
  balance?: number;
  /** The day the securing payment stops being refundable if it is paid today,
   *  worked out on the server so this component stays pure and the guest and
   *  the server never disagree about what day it is. */
  refundableUntil?: string | null;
  currency?: string;
  /** Overrides the default "Pay …" wording, e.g. for a securing payment. */
  label?: string;
  /** What this guest's country can actually pay with, worked out on the server.
   *  `null` hides the button: there is no point offering a checkout that ends
   *  on a bank list the guest is not on. */
  methods?: { kind: "rail" | "card"; feePct?: number } | null;
}) {
  const [busy, setBusy] = useState<null | "milestone" | "all">(null);
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const money = fmt(amount);
  const all = balance != null && balance > amount + 0.01 ? balance : null;

  async function go(which: "milestone" | "all" = "milestone") {
    setBusy(which); setError(null);
    try {
      const r = await fetch(`/api/portal/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: which === "all" && all ? all : amount }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) { setError(j.error || "Something went wrong. Please try again."); setBusy(null); return; }
      // Stripe's own page takes it from here; leave the button busy so a second
      // press cannot open a second checkout while the browser navigates.
      window.location.href = j.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  if (!(amount > 0)) return null;
  // No rail in their country and no lawful way to charge a card fee: the bank
  // transfer right below this is genuinely the better route, so say nothing.
  if (methods === null) return null;
  const isCard = methods?.kind === "card";

  return (
    <div className="mt-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => go("milestone")}
          disabled={busy !== null}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#00374a] hover:bg-[#00293a] disabled:opacity-60 text-white text-[14px] font-bold transition-colors"
        >
          {busy === "milestone" ? "Opening…" : (label ?? `Pay ${money} now`)}
        </button>
        {/* Paying the lot in one go: quieter, because the plan is the normal
            way, but right there for the people who would rather be done. */}
        {all && (
          <button
            onClick={() => go("all")}
            disabled={busy !== null}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white hover:bg-[#f4f9fa] disabled:opacity-60 text-[#00374a] text-[14px] font-bold border border-[#dde6e9] transition-colors"
          >
            {busy === "all" ? "Opening…" : `Pay all now, ${fmt(all)}`}
          </button>
        )}
      </div>
      <p className="text-[12px] text-[#7d8b91] mt-2">
        {refundableUntil ? (all ? <>Either way, the first {fmt(amount)} stays refundable until {refundableUntil}. </> : <>Refundable until {refundableUntil}. </>) : null}
        Straight from your own bank: iDEAL, Wero, Bancontact, whichever yours is. Or ignore this and transfer from your invoice, both land in the same place.
      </p>
      {error && <p className="text-[12.5px] text-[#b4472a] mt-2">{error}</p>}
    </div>
  );
}
