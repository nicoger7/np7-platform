"use client";

import { NP7_EXPERIENCE_LOGO } from "@/components/shared/brand";
import { fmtVoucherMoney, VOUCHER_HOW_TO_REDEEM } from "@/lib/vouchers";

/**
 * Print-/PDF-ready gift voucher. A branded card the buyer prints or saves as PDF
 * (browser "Save as PDF"). Print CSS hides the toolbar so only the voucher prints.
 *
 * Reads as what it is, a voucher worth a value (Nico, 27 Sep 2026). The
 * headline used to be "You're going windsurfing" with a surfer emoji on a €200
 * voucher, the card never said who it was from although the PDF did, and the
 * redeem line described its own process ("start a booking for this trip")
 * instead of the one sentence every other surface uses.
 */
export function VoucherPrint({
  code, experienceTitle, amount, currency, recipientName, fromName = null, message, redeemBy,
}: {
  code: string;
  experienceTitle: string;
  amount: number | null;
  currency: string;
  recipientName: string | null;
  /** The buyer's name, shown as "From ...". Optional: older callers pass none. */
  fromName?: string | null;
  message: string | null;
  redeemBy: string | null;
}) {
  const by = redeemBy ? new Date(redeemBy).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="min-h-[100svh] bg-[#fff7ec] py-8 px-4">
      <div className="no-print max-w-[640px] mx-auto mb-5 flex items-center justify-between">
        <a href="/account/vouchers" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← Gift vouchers</a>
        <button onClick={() => window.print()} className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">Print / Save as PDF</button>
      </div>

      <div className="voucher-card max-w-[640px] mx-auto bg-white rounded-3xl overflow-hidden shadow-[0_18px_50px_rgba(0,55,74,0.14)] border border-[#f0e6d6]">
        <div className="relative px-8 pt-9 pb-8 text-white" style={{ background: "radial-gradient(120% 120% at 50% -20%, #f47b20 0%, #00374a 60%)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_EXPERIENCE_LOGO} alt="NP7 Experience" className="h-7 w-auto mb-6" />
          <p className="text-[11px] font-bold tracking-[0.3em] text-[#ffc42e]">GIFT VOUCHER</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] leading-tight mt-2">A gift for your next NP7 trip</h1>
          <p className="text-[16px] text-white/85 mt-2">{experienceTitle}</p>
        </div>

        <div className="px-8 py-7">
          {recipientName && <p className="text-[15px] text-[#3a4a50] mb-1">For <strong className="text-[#00374a]">{recipientName}</strong></p>}
          {fromName && <p className="text-[15px] text-[#3a4a50] mb-1">From <strong className="text-[#00374a]">{fromName}</strong></p>}
          {message && <p className="text-[14.5px] text-[#5a6b72] italic leading-relaxed mb-5">“{message}”</p>}

          <div className="flex items-end justify-between gap-4 rounded-2xl bg-[#fff7ec] border border-[#f0e6d6] px-5 py-4 mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a9aa0]">Voucher code</p>
              <p className="text-[22px] font-black font-mono tracking-wide text-[#00374a] mt-0.5">{code}</p>
            </div>
            {amount != null && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a9aa0]">Value</p>
                <p className="text-[22px] font-black text-[#00374a] mt-0.5">{fmtVoucherMoney(amount, currency)}</p>
              </div>
            )}
          </div>

          <div className="h-[3px] w-full rounded-full mb-5" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20,#00afdb)" }} />
          <p className="text-[13px] text-[#6a7a80] leading-relaxed">
            <strong className="text-[#00374a]">How to use it</strong> at <strong>np-seven.com</strong>: {VOUCHER_HOW_TO_REDEEM} If the trip costs less, whatever is left stays on the voucher.
            {by ? <> Valid until <strong>{by}</strong>.</> : null} Questions? experience@np-seven.com
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .voucher-card { box-shadow: none !important; border: none !important; }
        }
      `}</style>
    </div>
  );
}
