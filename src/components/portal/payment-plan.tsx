import { dueUrgency, type Milestone } from "@/lib/payments";

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

  // Escalation on the SECURING payment (deposit or downpayment): a few days
  // before its deadline → last-chance warning; past it → the spot is no longer
  // held. Communication only — a payment still un-expires it.
  const securing = milestones.find((m) => (m.kind === "deposit" || m.kind === "downpayment") && m.status !== "paid");
  const urgency = securing ? dueUrgency(securing) : "ok";

  const dot = (s: Milestone["status"]) =>
    s === "paid"
      ? "bg-green-500 text-white"
      : s === "due"
      ? "bg-[#f47b20] text-white"
      : "bg-[#e3eef1] text-[#9aa6ac]";

  return (
    <div>
      {urgency === "last_chance" && securing?.dueDate && (
        <div className="mb-4 rounded-xl border border-[#f6d9a8] bg-[#fff7e8] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#9a6a12]">⏳ Last chance to secure your spot</p>
          <p className="text-[12.5px] text-[#8a6a2a] leading-snug mt-0.5">
            Pay your {securing.kind === "deposit" ? "deposit" : "downpayment"} of <strong>{money(securing.amount, currency)}</strong> by{" "}
            <strong>{fmtDate(securing.dueDate)}</strong> — after that we can&apos;t hold your place on the trip.
          </p>
        </div>
      )}
      {urgency === "expired" && (
        <div className="mb-4 rounded-xl border border-[#f3c1b0] bg-[#fdf0eb] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#b3401f]">Your payment window has passed</p>
          <p className="text-[12.5px] text-[#a05236] leading-snug mt-0.5">
            We can no longer hold your spot — it&apos;s open to other riders until it fills. Pay now and it&apos;s yours again if it&apos;s still free, or message us and we&apos;ll do our best to sort it.
          </p>
        </div>
      )}
      <ol className="relative">
        {milestones.map((m, i) => {
          const last = i === milestones.length - 1;
          // Part of this milestone can already be covered — by an earlier
          // overpayment, or by paying a round number. Show what's left to
          // transfer, not the plan's nominal slice, or the member is asked for
          // money they've already sent.
          const left = Math.max(0, m.cumulative - paid);
          const covered = m.status === "paid" ? 0 : Math.max(0, Math.min(m.amount, m.amount - left));
          const showLeft = m.status !== "paid" && covered > 0.01;
          return (
            <li key={m.kind} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && <span className="absolute left-3 top-6 bottom-0 w-px -translate-x-1/2 bg-[#eadfce]" aria-hidden />}
              <span className={`relative z-10 shrink-0 w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold ${dot(m.status)}`}>
                {m.status === "paid" ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1 mt-[3px]">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-bold text-[#00374a] leading-snug">{m.label}</p>
                  <p className="text-[14px] font-extrabold text-[#00374a] tabular-nums shrink-0 pl-1">{money(showLeft ? left : m.amount, currency)}</p>
                </div>
                <p className={`text-[12.5px] leading-snug mt-0.5 ${m.status === "paid" ? "text-green-600 font-semibold" : m.status === "due" ? "text-[#c9620f] font-semibold" : "text-[#9aa6ac]"}`}>
                  {m.status === "paid" ? "Paid ✓" : m.dueLabel}
                  {showLeft && (
                    <span className="text-[#9aa6ac] font-normal"> · {money(covered, currency)} of {money(m.amount, currency)} already covered</span>
                  )}
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
