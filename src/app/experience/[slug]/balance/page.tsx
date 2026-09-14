import Link from "next/link";
import { headers } from "next/headers";
import { flags } from "@/lib/flags";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { OceanHeader } from "@/components/experience/ocean-header";
import { outstandingForBooking } from "@/lib/events";
import { eur } from "@/lib/stripe";
import { PayBalanceButton } from "@/components/experience/pay-balance-button";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Pay your balance — NP7" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ booking?: string; from?: string }> };

/** Did this visitor arrive from inside the member area? Only ever used as a
 *  signal for where "back" should point — the destination is always this
 *  booking's own page, so a forged value cannot send anyone off-site. */
function cameFromAccount(raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (raw.startsWith("/")) return raw.startsWith("/account/") && !raw.startsWith("//");
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const ours = host === "np-seven.com" || host.endsWith(".np-seven.com") || host === "localhost" || host === "127.0.0.1";
    return ours && u.pathname.startsWith("/account/");
  } catch { return false; }
}

/**
 * "What is still owed on this ticket" — reached two ways, and it has to be
 * honest in both: from the "your date is confirmed" email (anonymous, the
 * booking id is the token) and from a member's own Payment tab.
 */
export default async function BalancePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booking: bookingId, from } = await searchParams;
  if (!bookingId) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: b } = await db
    .from("exp_bookings")
    .select("id, experience_id, contact_id, agreed_price, final_payment_received, downpayment_received, event_date_ids, exp_experiences(title,slug,currency,event_deposit_pct,event_refund_pct,page_template)")
    .eq("id", bookingId).maybeSingle();
  if (!b || b.exp_experiences?.page_template !== "event" || b.exp_experiences.slug !== slug) notFound();

  const cur = b.exp_experiences.currency ?? "EUR";
  const price = Number(b.agreed_price) || 0;
  const { paid: paidSoFar, outstanding: balance } = await outstandingForBooking(db, b.id, price);

  // Which of the buyer's dates actually got confirmed (for the header line).
  const { data: confirmed } = await db
    .from("exp_event_dates").select("date_start,date_end,label,status")
    .eq("experience_id", b.experience_id).eq("status", "confirmed").maybeSingle();

  // A balance settled by bank transfer or at the centre never sets this flag
  // through Stripe, so trust the money as well as the flag.
  const paid = !!b.final_payment_received || balance <= 0;
  /* Nothing received yet. This is not a fault — it is the commonest way into
     this page from the member area, where the ticket is simply unpaid — so the
     page asks for the whole ticket instead of talking about a "balance" and a
     deposit that was never meant to exist. */
  const nothingPaid = paidSoFar <= 0;

  // Where "back" goes. A member who walked here from their own booking is sent
  // back to it, on the Payment tab (the portal opens a tab from the hash).
  // Anyone else came off the sales page or the email, and gets the event.
  const member = await getPortalUser().catch(() => null);
  const mine = !!member?.contactId && member.contactId === b.contact_id;
  const fromPortal = mine || cameFromAccount(from) || cameFromAccount((await headers()).get("referer"));
  const backHref = fromPortal ? `/account/bookings/${b.id}#payment` : `/experience/${slug}`;
  const backLabel = fromPortal ? "← Back to your booking" : "← Back to the event";

  return (
    <main className="min-h-screen bg-[#fbfdfd]">
      <OceanHeader bookHref="#"  showAbout={flags.showExperience} showHardware={flags.showHardware} />
      <div className="max-w-[520px] mx-auto px-6 pt-28 pb-16">
        <div className="rounded-2xl bg-white border border-[#e3e9ec] shadow-[0_18px_50px_rgba(0,40,55,0.1)] p-7 sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e]">
            {confirmed ? "Your date is confirmed" : paid || nothingPaid ? "Your ticket" : "Your remaining balance"}
          </p>
          <h1 className="text-2xl font-black text-[#00374a] mt-2">{b.exp_experiences.title}</h1>
          {confirmed && (
            <p className="text-[14px] text-[#6a7a80] mt-1">
              {confirmed.label ? `${confirmed.label} · ` : ""}
              {new Date(confirmed.date_start).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}

          {paid ? (
            <div className="mt-6 rounded-xl bg-[#eafaf0] border border-[#bfe8cf] px-5 py-4 text-center">
              <p className="text-[15px] font-bold text-[#1f7a45]">All paid, you&apos;re set! 🌊</p>
              <p className="text-[13px] text-[#3a6a4e] mt-1">See you on the water.</p>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac]">{nothingPaid ? "To pay" : "Balance due"}</span>
                <span className="text-[30px] font-black text-[#00374a] tabular-nums">{eur(balance, cur)}</span>
              </div>
              <p className="text-[12.5px] text-[#6a7a80] mt-1">
                {nothingPaid
                  ? "Nothing paid on this booking yet, so this is the full ticket."
                  : `Your ${eur(price, cur)} ticket, less the ${eur(paidSoFar, cur)} already paid.`}
              </p>
              <div className="mt-6">
                <PayBalanceButton
                  bookingId={b.id}
                  cta={nothingPaid ? `Pay ${eur(balance, cur)}` : `Pay balance · ${eur(balance, cur)}`}
                  from={fromPortal ? `/account/bookings/${b.id}` : undefined}
                />
              </div>
            </>
          )}

          <p className="text-center mt-6"><Link href={backHref} className="text-[12.5px] text-[#9aa6ac] hover:underline">{backLabel}</Link></p>
        </div>
      </div>
    </main>
  );
}
