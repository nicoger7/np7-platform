import Link from "next/link";
import { flags } from "@/lib/flags";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { ensureMemberAccount } from "@/lib/members";
import { sendEmail } from "@/lib/email/send";

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return undefined;
  const s = new Date(start), e = end ? new Date(end) : null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${d(s)} – ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
}

/** Provision the member account + send the deposit confirmation (idempotent). */
async function onDepositPaid(bookingId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  await db.from("exp_bookings")
    .update({ status: "confirmed", downpayment_received: true, updated_at: new Date().toISOString() })
    .eq("id", bookingId);

  const { data: booking } = await db.from("exp_bookings")
    .select("id, contact_id, exp_experiences(title), exp_editions(date_start,date_end), contacts(name,email)")
    .eq("id", bookingId).maybeSingle();
  const contact = booking?.contacts;
  if (!contact?.email) return;

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const firstName = (contact.name ?? "").split(" ")[0] || undefined;

  const acct = await ensureMemberAccount({ contactId: booking.contact_id, email: contact.email, origin }).catch(() => null);
  await sendEmail({
    to: contact.email,
    templateKey: "deposit_confirmation",
    vars: {
      firstName,
      experienceTitle: booking.exp_experiences?.title,
      dates: fmtRange(booking.exp_editions?.date_start, booking.exp_editions?.date_end),
      activationLink: acct && "link" in acct ? acct.link : `${origin}/account/login`,
    },
    bookingId,
    contactId: booking.contact_id,
    dedupeKey: `deposit_confirmation:${bookingId}`,
  }).catch(() => {});
}

export const metadata: Metadata = { title: "Reservation confirmed — NP7 Experience" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string; reserved?: string }>;
};

/**
 * Post-checkout landing. Verifies the Stripe session server-side (no webhook
 * needed) and marks the booking "confirmed" — the hold-deposit is in, so the
 * spot is secured. Also serves the no-payment fallback (?reserved=1).
 */
export default async function ThanksPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { session_id, reserved } = await searchParams;

  let state: "paid" | "reserved" | "unpaid" = reserved ? "reserved" : "unpaid";

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (session_id && stripeKey) {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
      cache: "no-store",
    });
    const session = await res.json();
    if (res.ok && session.payment_status === "paid") {
      state = "paid";
      const bookingId = session.metadata?.booking_id;
      if (bookingId) await onDepositPaid(bookingId).catch(() => {});
    }
  }

  const ok = state === "paid" || state === "reserved";

  return (
    <>
      <OceanHeader bookHref={`/experience/${slug}#packages`}  showAbout={flags.showExperience} showHardware={flags.showHardware} />
      <main className="min-h-[100svh] bg-[#fff7ec] flex items-center justify-center px-6 pt-24 pb-16">
        <div className="max-w-[560px] w-full text-center">
          <div className={`mx-auto w-16 h-16 rounded-full grid place-items-center mb-6 ${ok ? "bg-[#00afdb]" : "bg-[#f47b20]"}`}>
            {ok ? (
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 8v5M12 16.5v.5" /></svg>
            )}
          </div>

          {state === "paid" && (
            <>
              <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-3">Your spot is reserved! 🤙</h1>
              <p className="text-[16px] text-[#5a6b72] leading-relaxed mb-9">Deposit received — you&apos;re officially coming. Get ready for the week your jibes have been waiting for.</p>
            </>
          )}
          {state === "reserved" && (
            <>
              <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-3">Your spot is reserved! 🤙</h1>
              <p className="text-[16px] text-[#5a6b72] leading-relaxed mb-9">We&apos;ve saved your reservation — we&apos;ll send your deposit payment link right away.</p>
            </>
          )}
          {state === "unpaid" && (
            <>
              <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-3">Payment not completed</h1>
              <p className="text-[16px] text-[#5a6b72] leading-relaxed mb-9">No worries — your card wasn&apos;t charged. You can head back and try again, or just reply to our email and we&apos;ll sort it together.</p>
            </>
          )}

          {ok && (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-7 text-left mb-9">
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-4">What happens next</p>
              <ol className="space-y-4">
                {[
                  { t: "We contact you personally", d: "Within a day or two you'll hear from us directly — we'll go through every detail and answer all your questions." },
                  { t: "Flying in early or out late?", d: "You can add extra hotel nights with us at any time — just tell us your flight dates." },
                  { t: "We sort the rest", d: "Gear, level group, focus points — everything gets dialled in before you land. You just show up." },
                ].map((s, i) => (
                  <li key={i} className="flex gap-3.5">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-[#00afdb]/10 text-[#00afdb] grid place-items-center text-[13px] font-extrabold">{i + 1}</span>
                    <span><span className="block text-[14.5px] font-bold text-[#00374a]">{s.t}</span><span className="block text-[13.5px] text-[#6a7a80] leading-relaxed mt-0.5">{s.d}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className={ok ? "flex flex-col sm:flex-row items-center justify-center gap-3" : ""}>
            {ok && (
              <Link
                href="/account"
                className="inline-block px-8 py-4 rounded-full text-[14px] font-bold text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.35)] transition-all hover:-translate-y-0.5"
              >
                Go to my account
              </Link>
            )}
            <Link
              href={`/experience/${slug}${ok ? "" : "#packages"}`}
              className={`inline-block px-8 py-4 rounded-full text-[14px] font-bold transition-all hover:-translate-y-0.5 ${ok ? "text-[#00374a] bg-white border border-[#e3d9c8]" : "text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.35)]"}`}
            >
              {ok ? "Back to the experience" : "Try again"}
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-3 text-[12px] text-[#9aa6ac]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-4 w-auto opacity-50" />
            <span>NP7 Experience · we ride together</span>
          </div>
        </div>
      </main>
    </>
  );
}
