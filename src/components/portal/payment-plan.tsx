import type { Milestone } from "@/lib/payments";

const money = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The member's payment plan: deposit → downpayment → final, as a vertical
 * timeline with what's paid, what's due and by when. Presentational — the
 * milestones are computed by computePaymentPlan() upstream.
 */
export function PaymentPlan({
  milestones,
  currency = "EUR",
  total,
  paid,
}: {
  milestones: Milestone[];
  currency?: string;
  total: number;
  paid: number;
}) {
  const balance = Math.max(0, total - paid);
  const paidInFull = total > 0 && balance <= 0.01;

  const dot = (s: Milestone["status"]) =>
    s === "paid"
      ? "bg-green-500 text-white"
      : s === "due"
      ? "bg-[#f47b20] text-white"
      : "bg-[#e3eef1] text-[#9aa6ac]";

  return (
    <div>
      <ol className="relative">
        {milestones.map((m, i) => {
          const last = i === milestones.length - 1;
          return (
            <li key={m.kind} className="relative flex gap-3.5 pb-5 last:pb-0">
              {!last && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-[#eadfce]" aria-hidden />}
              <span className={`relative z-10 shrink-0 w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold ${dot(m.status)}`}>
                {m.status === "paid" ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1 -mt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[14px] font-bold text-[#00374a] leading-tight">{m.label}</p>
                  <p className="text-[14px] font-extrabold text-[#00374a] tabular-nums shrink-0">{money(m.amount, currency)}</p>
                </div>
                <p className={`text-[12.5px] leading-snug mt-0.5 ${m.status === "paid" ? "text-green-600 font-semibold" : m.status === "due" ? "text-[#c9620f] font-semibold" : "text-[#9aa6ac]"}`}>
                  {m.status === "paid" ? "Paid ✓" : m.dueLabel}
                  {m.kind === "deposit" && m.status !== "paid" && m.refundableUntil && (
                    <span className="text-[#9aa6ac] font-normal"> · refundable until {fmtDate(m.refundableUntil)}</span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 pt-4 border-t border-[#f3ede2] space-y-1.5">
        <div className="flex justify-between text-[13.5px]"><span className="text-[#6a7a80]">Trip total</span><span className="font-bold text-[#00374a] tabular-nums">{money(total, currency)}</span></div>
        {paid > 0 && <div className="flex justify-between text-[13.5px]"><span className="text-[#6a7a80]">Paid so far</span><span className="font-bold text-green-600 tabular-nums">{money(paid, currency)} ✓</span></div>}
        <div className="flex justify-between text-[14px]">
          <span className="font-bold text-[#00374a]">{paidInFull ? "Status" : "Balance due"}</span>
          <span className={`font-extrabold tabular-nums ${paidInFull ? "text-green-600" : "text-[#00374a]"}`}>{paidInFull ? "Paid in full ✓" : money(balance, currency)}</span>
        </div>
      </div>

      {!paidInFull && (
        <p className="text-[12px] text-[#9aa6ac] mt-3 leading-relaxed">
          Everything is paid by <strong className="text-[#6a7a80] font-semibold">bank transfer</strong> — pay any milestone sooner if you like. We send each invoice with the bank details in good time before its deadline; payments we&apos;ve received are reflected above.
        </p>
      )}
    </div>
  );
}
