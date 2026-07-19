import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase";
import { OceanHeader } from "@/components/experience/ocean-header";
import { eventPricing } from "@/lib/events";
import { eur } from "@/lib/stripe";
import { PayBalanceButton } from "@/components/experience/pay-balance-button";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Pay your balance — NP7" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ booking?: string }> };

/** Standby balance page — reached from the "your date is confirmed" email. */
export default async function BalancePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booking: bookingId } = await searchParams;
  if (!bookingId) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: b } = await db
    .from("exp_bookings")
    .select("id, experience_id, agreed_price, final_payment_received, downpayment_received, event_date_ids, exp_experiences(title,slug,currency,event_deposit_pct,event_refund_pct,page_template)")
    .eq("id", bookingId).maybeSingle();
  if (!b || b.exp_experiences?.page_template !== "event" || b.exp_experiences.slug !== slug) notFound();

  const cur = b.exp_experiences.currency ?? "EUR";
  const price = Number(b.agreed_price) || 0;
  const { balance } = eventPricing(price, b.exp_experiences.event_deposit_pct ?? 20, b.exp_experiences.event_refund_pct ?? 15);

  // Which of the buyer's dates actually got confirmed (for the header line).
  const { data: confirmed } = await db
    .from("exp_event_dates").select("date_start,date_end,label,status")
    .eq("experience_id", b.experience_id).eq("status", "confirmed").maybeSingle();

  const paid = !!b.final_payment_received;

  return (
    <main className="min-h-screen bg-[#fbfdfd]">
      <OceanHeader bookHref="#" />
      <div className="max-w-[520px] mx-auto px-6 pt-28 pb-16">
        <div className="rounded-2xl bg-white border border-[#e3e9ec] shadow-[0_18px_50px_rgba(0,40,55,0.1)] p-7 sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e]">Your date is confirmed</p>
          <h1 className="text-2xl font-black text-[#00374a] mt-2">{b.exp_experiences.title}</h1>
          {confirmed && (
            <p className="text-[14px] text-[#6a7a80] mt-1">
              {confirmed.label ? `${confirmed.label} · ` : ""}
              {new Date(confirmed.date_start).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}

          {paid ? (
            <div className="mt-6 rounded-xl bg-[#eafaf0] border border-[#bfe8cf] px-5 py-4 text-center">
              <p className="text-[15px] font-bold text-[#1f7a45]">All paid — you&apos;re set! 🌊</p>
              <p className="text-[13px] text-[#3a6a4e] mt-1">See you on the water.</p>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac]">Balance due</span>
                <span className="text-[30px] font-black text-[#00374a] tabular-nums">{eur(balance, cur)}</span>
              </div>
              <p className="text-[12.5px] text-[#6a7a80] mt-1">Your {eur(price, cur)} ticket, less the deposit you already paid.</p>
              <div className="mt-6"><PayBalanceButton bookingId={b.id} amountLabel={eur(balance, cur)} /></div>
            </>
          )}

          <p className="text-center mt-6"><Link href={`/experience/${slug}`} className="text-[12.5px] text-[#9aa6ac] hover:underline">← Back to the event</Link></p>
        </div>
      </div>
    </main>
  );
}
