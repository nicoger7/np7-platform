"use client";

import { useState } from "react";

export function PayBalanceButton({ bookingId, amountLabel }: { bookingId: string; amountLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pay() {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/event/balance-checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.url) { window.location.assign(j.url); return; }
      setError(j.error || "Something went wrong — please try again."); setBusy(false);
    } catch { setError("Something went wrong — please try again."); setBusy(false); }
  }
  return (
    <>
      <button type="button" onClick={pay} disabled={busy}
        className="w-full rounded-full py-3.5 text-[15px] font-black text-[#00374a] disabled:opacity-50 transition-transform active:scale-[0.99]"
        style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 60%,#f47b20)" }}>
        {busy ? "One sec…" : `Pay balance — ${amountLabel}`}
      </button>
      {error && <p className="text-[13px] font-semibold text-[#c0392b] mt-2 text-center">{error}</p>}
      <p className="text-[11.5px] text-[#9aa6ac] text-center mt-2">Secure payment via Stripe.</p>
    </>
  );
}
