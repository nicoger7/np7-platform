"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
import { fmtVoucherValue } from "@/lib/vouchers";

/**
 * "Apply a gift voucher": a small form on the member booking page. Sends the
 * code to the redeem API, which credits what the trip still owes to this
 * booking's payment plan. Shown only while there's still a balance to pay.
 *
 * Whatever the trip does not need stays on the voucher (Nico, 27 Sep 2026).
 * This used to say, after the fact, that the rest "isn't carried over": a
 * €10,000 gift on a €2,390 week told the guest they had just lost €7,610.
 */
export function RedeemVoucher({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { applied: number; left: number; currency: string }>(null);

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed) { setError("Enter your voucher code."); return; }
    setBusy(true);
    setError(null);
    // A dropped connection used to leave the button stuck on "Applying…" with no
    // message: the member sat there believing a €500 gift voucher was being
    // credited to their trip, when nothing had been sent at all.
    const res = await mutate<{ amount?: number; left?: number; currency?: string }>("/api/portal/vouchers/redeem", {
      method: "POST",
      body: { code: trimmed, bookingId },
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const data = res.data ?? {};
    setDone({ applied: Number(data.amount) || 0, left: Number(data.left) || 0, currency: data.currency || "EUR" });
    router.refresh();
  }

  if (done) {
    return (
      <div className="text-[12.5px] font-semibold text-green-600">
        ✓ Voucher applied{done.applied > 0 ? `: ${fmtVoucherValue(done.applied, done.currency)} off this trip` : ""}. Your payment plan has been updated.
        {done.left > 0 && (
          <span className="block font-normal text-[#8a9aa0] mt-0.5">
            {fmtVoucherValue(done.left, done.currency)} left on your voucher. Keep the code for your next trip.
          </span>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-semibold text-[#00afdb] hover:underline"
      >
        Have a gift voucher? Apply it
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="NP7-XXXX-XXXX"
          autoFocus
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[#dce3e6] text-[13px] font-mono tracking-wide uppercase text-[#00374a] placeholder:text-[#b4c0c5] focus:outline-none focus:border-[#00afdb] focus:ring-1 focus:ring-[#00afdb]"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="shrink-0 px-4 py-2 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-50 transition-colors"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
