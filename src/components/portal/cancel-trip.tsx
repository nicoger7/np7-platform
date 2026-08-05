"use client";

import { useState } from "react";
import type { Milestone } from "@/lib/payments";

const money = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/**
 * "Cancel this trip" — a quiet link that opens a modal explaining exactly what
 * cancelling means at the member's current stage (refundable deposit vs.
 * non-refundable downpayment/balance + a goodwill credit voucher), then sends a
 * cancellation request to the team (refunds/vouchers are handled by the team).
 */
export function CancelTrip({ bookingId, milestones, paid, currency = "EUR" }: {
  bookingId: string;
  milestones: Milestone[];
  paid: number;
  currency?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [error, setError] = useState("");

  const deposit = milestones.find((m) => m.kind === "deposit");
  const depositPaid = deposit?.status === "paid";
  const depositRefundable = !!deposit?.refundableUntil && new Date(deposit.refundableUntil) >= new Date();
  const beyondDeposit = milestones.some((m) => m.kind !== "deposit" && m.status === "paid");

  // Our cancellation-fee scale = the milestones: free until the deposit's refund
  // window closes, then the fee is whatever you've paid (deposit → 50% → 100%).
  // The goodwill voucher is a maybe, not a promise — it's decided case by case
  // and it's usually small, so this must not read as compensation the guest is
  // owed. Nobody should cancel expecting one.
  let tone: "ok" | "warn" = "ok";
  let headline = "";
  let detail = "";
  if (paid <= 0) {
    headline = "Nothing's locked in yet";
    detail = "You haven't paid anything, so cancelling is free and costs you nothing.";
  } else if (depositPaid && depositRefundable && !beyondDeposit) {
    headline = "Your deposit is still refundable";
    detail = `You're within the deposit's refund window${deposit?.refundableUntil ? ` (until ${new Date(deposit.refundableUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })})` : ""}, so you'd get your ${money(paid, currency)} back in full.`;
  } else if (beyondDeposit) {
    tone = "warn";
    headline = "Past the refund point";
    detail = `The ${money(paid, currency)} you've paid is the cancellation fee at this stage, so it isn't refundable. Before you do: you can pass your place to someone else instead, which costs you nothing — just tell us who.`;
  } else {
    tone = "warn";
    headline = "Your deposit is the cancellation fee now";
    detail = `Your ${money(paid, currency)} deposit is past its refund window, so it's kept as the cancellation fee and nothing more is owed. You can also pass your place to someone else instead, which costs you nothing.`;
  }

  async function request() {
    setBusy(true); setError("");
    const res = await fetch(`/api/portal/bookings/${bookingId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid }) });
    setBusy(false);
    // No voucher promised on the way out either: a confirmation screen that
    // mentions one is the same promise, just later.
    if (res.ok) setDoneMsg("Cancellation requested — our team will be in touch shortly to confirm and sort out anything owed.");
    else { const j = await res.json().catch(() => ({})); setError(j.error || "Couldn't send the request — please email us."); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[12.5px] font-semibold text-[#b9a48a] hover:text-[#8a9aa0] underline underline-offset-2 transition-colors">
        Cancel this trip
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-7 max-w-[460px] w-full">
            {doneMsg ? (
              <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#00afdb] grid place-items-center mb-4"><svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
                <p className="text-[14.5px] text-[#3a4a50] leading-relaxed mb-5">{doneMsg}</p>
                <button onClick={() => setOpen(false)} className="px-6 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb]">Close</button>
              </div>
            ) : (
              <>
                <h3 className="text-[19px] font-black text-[#00374a] mb-1">Cancel your trip?</h3>
                <div className={`rounded-xl p-4 my-4 ${tone === "warn" ? "bg-amber-50 border border-amber-200" : "bg-[#eef6f8] border border-[#d4e8ee]"}`}>
                  <p className={`text-[14px] font-bold ${tone === "warn" ? "text-amber-800" : "text-[#0782a0]"}`}>{headline}</p>
                  <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-1">{detail}</p>
                </div>
                <p className="text-[12.5px] text-[#9aa6ac] leading-relaxed mb-5">Cancellation terms follow our package-travel conditions. Send the request and our team will confirm your refund or credit voucher — you&apos;re not charged anything by clicking below.</p>
                {error && <p className="text-[13px] text-red-500 mb-3">{error}</p>}
                <div className="flex gap-2.5">
                  <button onClick={() => setOpen(false)} disabled={busy} className="flex-1 px-5 py-3 rounded-full text-[13.5px] font-bold text-[#6a7a80] bg-[#f1f5f6]">Keep my trip</button>
                  <button onClick={request} disabled={busy} className="flex-1 px-5 py-3 rounded-full text-[13.5px] font-bold text-white bg-[#d8631a] hover:bg-[#c0560f] disabled:opacity-60 transition-colors">{busy ? "Sending…" : "Request cancellation"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
