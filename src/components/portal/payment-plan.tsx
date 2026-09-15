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
  voucherCredit = 0,
  pay,
  pending,
}: {
  milestones: Milestone[];
  currency?: string;
  /** Portion of `paid` that came from gift-voucher redemptions. */
  voucherCredit?: number;
  total: number;
  paid: number;
  /** The "pay now" button, when this member can pay online. Rendered under the
   *  totals, beside the transfer line: two ways to do the same thing. */
  pay?: React.ReactNode;
  /** Money already on its way by bank transfer. Rendered ABOVE the button,
   *  because "it's coming" is the answer to the question the button provokes. */
  pending?: React.ReactNode;
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
      {/*
        * A reminder, not a threat, and the reason is a fact about how NP7
        * actually works: nothing here releases a spot. No cron cancels, no
        * status changes on a missed date. If a booking ever really has to be
        * let go, Nico does that by hand, in a conversation with the guest.
        *
        * So the old copy was not merely harsh, it was untrue, and it sat two
        * centimetres under a badge reading SPOT SECURED. A guest read "we can
        * no longer hold your spot" directly below us telling them it was held.
        * Whichever one they believed, we had lost them.
        */}
      {urgency === "last_chance" && securing?.dueDate && (
        <div className="mb-4 rounded-xl border border-[#f6d9a8] bg-[#fff7e8] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#9a6a12]">Your {securing.kind === "deposit" ? "deposit" : "downpayment"} is due soon</p>
          <p className="text-[12.5px] text-[#8a6a2a] leading-snug mt-0.5">
            <strong>{money(securing.amount, currency)}</strong> by <strong>{fmtDate(securing.dueDate)}</strong>. Your spot is held. If the date is awkward, just tell us and we&apos;ll work it out.
          </p>
        </div>
      )}
      {urgency === "expired" && (
        <div className="mb-4 rounded-xl border border-[#f6d9a8] bg-[#fff7e8] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#9a6a12]">This one is past its date</p>
          <p className="text-[12.5px] text-[#8a6a2a] leading-snug mt-0.5">
            Your spot is still yours. Whenever you can, send it over, and if something has changed or the timing is difficult, message us and we&apos;ll sort it out together.
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
                  {/* A remainder is not the stage, so it does not get the
                      stage's label: "Downpayment · 50% of your trip" over
                      €1,227 of an €8,003 trip is a sentence the guest has to
                      disprove with a calculator. The grey line underneath
                      carries the rest of the story. */}
                  <p className="text-[14px] font-bold text-[#00374a] leading-snug">{showLeft ? `${m.shortLabel} · still to send` : m.label}</p>
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
        {voucherCredit > 0 && (
          <div className="flex justify-between text-[12.5px]"><span className="text-[#9aa6ac] pl-3">incl. gift voucher</span><span className="font-semibold text-[#8a6a2a] tabular-nums">🎁 {money(voucherCredit, currency)}</span></div>
        )}
        <div className="flex justify-between text-[14px]">
          <span className="font-bold text-[#00374a]">{paidInFull ? "Status" : "Balance due"}</span>
          <span className={`font-extrabold tabular-nums ${paidInFull ? "text-green-600" : "text-[#00374a]"}`}>{paidInFull ? "Paid in full ✓" : money(balance, currency)}</span>
        </div>
      </div>

      {!paidInFull && pending}
      {!paidInFull && pay}

      {/* Two sentences, because there are two truths. Where the guest's country
          has an instant rail the button above is real and the transfer is the
          alternative. Where it has not, `pay` is null, and promising a button
          that is not on the page is the quickest way to lose their trust in the
          rest of it.

          A third truth is silence. A guest with money already moving and no
          button above (the caller drops it when the transfer covers the whole
          of what is due) must not be told to "pay by bank transfer using the
          details on your invoice": they did that last night, and read as an
          instruction it asks them to do it twice. A PART transfer still has its
          button, so the sentence stays and is right about the rest. */}
      {!paidInFull && (pay || !pending) && (
        <p className="text-[12px] text-[#9aa6ac] mt-3 leading-relaxed">
          {pay
            ? <>Pay online above, or by <strong className="text-[#6a7a80] font-semibold">bank transfer</strong> from the invoice, whichever suits you.</>
            : <>Pay by <strong className="text-[#6a7a80] font-semibold">bank transfer</strong> using the details on your invoice below.</>}
          {" "}Any milestone can be paid sooner. We send each invoice with the bank details in good time before its deadline; payments we&apos;ve received are reflected above.
        </p>
      )}
    </div>
  );
}
