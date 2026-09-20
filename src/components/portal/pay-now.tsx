"use client";

import { formatMoneyExact } from "@/lib/money";
import { useState } from "react";
import type { PayKind } from "@/lib/payment-methods";

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
 * the guest cannot finish. Where their country has neither an instant rail nor
 * a transfer the button does not appear at all and the bank details below it
 * are the answer.
 *
 * A TRANSFER NAMES ITSELF BEFORE THE PRESS. "Pay €1,440 now" is simply untrue
 * of a method that takes one to three working days, and a guest who reads
 * "now", presses, and lands on a page of bank details has been misled by us
 * rather than by Stripe. So the method is in the label, the footnote says what
 * the next screen holds and how long the money takes, and nothing anywhere
 * promises an instant payment or a return to a thank-you page.
 */
export function PayNow({ bookingId, amount, balance, refundableUntil, currency = "EUR", label, methods, preview }: {
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
  /** An admin looking at this member's page. The banner above already promises
   *  actions are disabled, and this one was not: the route refuses to act in
   *  the member's name and answered "Booking not found", which reads like the
   *  guest's booking is broken rather than like the preview doing its job. */
  preview?: boolean;
  /** What this guest's country can actually pay with, worked out on the server.
   *  `null` hides the button: there is no point offering a checkout that ends
   *  on a bank list the guest is not on. */
  /** `alsoTransfer` = this guest (US or UK) may ALSO pay by bank transfer
   *  through Stripe, in their own currency. */
  methods?: { kind: PayKind; feePct?: number; alsoTransfer?: "US" | "GB" | null } | null;
}) {
  const [busy, setBusy] = useState<null | "milestone" | "all" | "transfer">(null);
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number) => (formatMoneyExact(n, currency) as string);
  const money = fmt(amount);
  const all = balance != null && balance > amount + 0.01 ? balance : null;

  async function go(which: "milestone" | "all" | "transfer" = "milestone") {
    if (preview) return;
    setBusy(which); setError(null);
    try {
      const r = await fetch(`/api/portal/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: which === "all" && all ? all : amount,
          ...(which === "transfer" ? { method: "transfer" } : {}),
        }),
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
  const isTransfer = methods?.kind === "transfer";
  const isCard = methods?.kind === "card";
  // US and UK guests get the transfer BESIDE the card: Stripe can issue them
  // an account number of their own in dollars or pounds.
  const alsoTransfer = isCard ? (methods?.alsoTransfer ?? null) : null;

  // The label, which is a promise about the next screen, and the footnote,
  // which is the rest of that promise. A transfer guest must never be shown the
  // iDEAL/Wero/Bancontact line: none of those is what they are about to use.
  const primaryLabel = label ?? (isTransfer ? `Pay ${money} by bank transfer` : `Pay ${money} now`);
  const allLabel = all ? (isTransfer ? `Pay all by transfer, ${fmt(all)}` : `Pay all now, ${fmt(all)}`) : null;

  return (
    <div className="mt-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => go("milestone")}
          disabled={busy !== null || !!preview}
          title={preview ? "Disabled in the admin preview" : undefined}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#00374a] hover:bg-[#00293a] disabled:opacity-60 text-white text-[14px] font-bold transition-colors"
        >
          {busy === "milestone" ? "Opening…" : primaryLabel}
        </button>
        {/* Paying the lot in one go: quieter, because the plan is the normal
            way, but right there for the people who would rather be done. */}
        {all && (
          <button
            onClick={() => go("all")}
            disabled={busy !== null || !!preview}
            title={preview ? "Disabled in the admin preview" : undefined}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white hover:bg-[#f4f9fa] disabled:opacity-60 text-[#00374a] text-[14px] font-bold border border-[#dde6e9] transition-colors"
          >
            {busy === "all" ? "Opening…" : allLabel}
          </button>
        )}
      </div>
        {alsoTransfer && (
          <button
            onClick={() => go("transfer")}
            disabled={busy !== null || !!preview}
            title={preview ? "Disabled in the admin preview" : undefined}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white hover:bg-[#f4f9fa] disabled:opacity-60 text-[#00374a] text-[14px] font-bold border border-[#dde6e9] transition-colors"
          >
            {busy === "transfer" ? "Opening…" : `Pay by bank transfer (${alsoTransfer === "US" ? "USD" : "GBP"})`}
          </button>
        )}
      {preview && <p className="text-[12px] text-[#7d8b91] mt-2">Paying is disabled while you are looking at this as the member.</p>}
      <p className="text-[12px] text-[#7d8b91] mt-2">
        {refundableUntil ? (all ? <>Either way, the first {fmt(amount)} stays refundable until {refundableUntil}. </> : <>Refundable until {refundableUntil}. </>) : null}
        {/* Three routes, three different promises, and none of them names a
            method. The old rail line said "iDEAL, Wero, Bancontact" to every
            guest on earth, including an Austrian who has EPS and a Pole who has
            BLIK. Stripe shows each guest what their own bank supports, so the
            honest sentence describes what happens rather than what they will
            see. The transfer needs its own, because a guest who expects an
            instant payment and gets an account number has been misled. */}
        {/* The card had no sentence of its own and fell through to the rail's
            "Straight from your own bank, no fee", which is how a Canadian guest
            read "no fee" and then met a €71.28 card-fee line at checkout
            (Paul Mohr, 17 Sep 2026). A card guest is outside the EEA, where the
            fee is lawful but has to be said before they press. */}
        {isTransfer
          ? <>Press pay and we&apos;ll show you an account number that&apos;s yours alone, with the exact amount and a reference. Transfer it from your banking app the way you&apos;d pay anyone. It usually reaches us in one to three working days, and your spot is held from the moment you send it. We&apos;ll email you the same details so you don&apos;t have to keep this page open.</>
          : isCard
            ? alsoTransfer
              ? <>By card, plus a card fee. Or by bank transfer in {alsoTransfer === "US" ? "dollars" : "pounds"}: Stripe gives you an account number of your own, plus the transfer and conversion cost. <strong className="text-[#00374a]">A transfer in euros from your invoice below is free.</strong></>
              : <>By card, plus a card fee. <strong className="text-[#00374a]">Prefer a bank transfer? It&apos;s free:</strong> use the bank details on your invoice below.</>
            : <>Straight from your own bank, no fee. Or ignore this and transfer from your invoice, both land in the same place.</>}
      </p>
      {error && <p className="text-[12.5px] text-[#b4472a] mt-2">{error}</p>}
    </div>
  );
}
