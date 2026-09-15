/**
 * "Your transfer is on its way."
 *
 * The one screen a guest opens between sending the money and Stripe confirming
 * it, which is one to three working days of not knowing. Everything on it is
 * an answer to a question they would otherwise ask by email: how much, to
 * which account, with what reference, and what happens if they got it slightly
 * wrong.
 *
 * It says the exact amount twice and never invites rounding up. That is not
 * politeness: an over-transfer settles the booking correctly but leaves the
 * surplus sitting in a Stripe cash balance with no row anywhere in the
 * platform, so it is the one failure this page can actually prevent.
 *
 * Purely presentational. Every figure is passed in, nothing is fetched, and
 * the full IBAN is deliberately absent — the last four are enough to recognise
 * the account on a statement, and the real details live on Stripe's own
 * instructions page and in the email, which cannot go stale.
 *
 * The one exception is the escape hatch at the bottom, which has to talk to the
 * server, so it is its own client leaf (NotSent) the way PayNow is: this panel
 * stays a server component that only renders what it is handed.
 */
import { NotSent } from "@/components/portal/not-sent";

const money = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export function TransferPending({ amount, currency = "EUR", reference, ibanLast4, instructionsUrl, bookingId, linkId }: {
  amount: number;
  currency?: string;
  /** What Stripe told them to quote. Without it we cannot promise a match. */
  reference?: string | null;
  ibanLast4?: string | null;
  /** Stripe's hosted instructions page, where the real account details live. */
  instructionsUrl?: string | null;
  /**
   * The row this panel is about, when the guest is allowed to tell us they
   * never sent it (canSayNotSent, lib/bank-transfer). Null on a transfer
   * somebody at NP7 set up, and on one that money has already arrived against:
   * that row is the only record of the money, so it stays exactly where it is.
   */
  bookingId?: string | null;
  linkId?: string | null;
}) {
  if (!(amount > 0)) return null;
  return (
    <div className="mt-4 rounded-xl border border-[#f6d9a8] bg-[#fff7e8] px-4 py-3.5">
      <p className="text-[13.5px] font-bold text-[#9a6a12]">Waiting for your transfer</p>
      <p className="text-[12.5px] text-[#8a6a2a] leading-snug mt-1">
        <strong>{money(amount, currency)}</strong> is on its way to us. Send it to the account we showed you
        {ibanLast4 ? <>, the one ending <strong>{ibanLast4}</strong></> : null}
        {reference ? <>, with the reference <strong>{reference}</strong></> : null}
        , exactly that amount. Most transfers reach us in one to three working days, and your spot is held until it does.
      </p>
      {instructionsUrl && (
        <p className="mt-2">
          <a
            href={instructionsUrl}
            className="text-[12.5px] font-bold text-[#9a6a12] underline decoration-[#e3c48a] underline-offset-2 hover:text-[#7d5609]"
            target="_blank"
            rel="noreferrer"
          >
            See the account details again
          </a>
        </p>
      )}
      <p className="text-[12px] text-[#a08a5c] leading-snug mt-2">
        We credit whatever arrives. If it&apos;s less than the amount above, your plan below will show what&apos;s left.
      </p>
      {/* Last, and quiet. This panel exists for the guest whose money IS on its
          way, and the great majority of them need reassurance rather than a
          way out. The one who never sent it needs this more than anything else
          on the card, so it is present, plainly worded and never a shout. */}
      {bookingId && linkId && <NotSent bookingId={bookingId} linkId={linkId} />}
    </div>
  );
}
