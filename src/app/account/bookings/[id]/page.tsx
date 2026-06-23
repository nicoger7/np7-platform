import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getMemoryPhotosForBooking, getBookingPaid, getBookingHotel, getEditionCoaches, getMemoryDownloadsRemaining, getConfirmedAddonsTotal, getBookingFlights, getExperienceArrivalInfo, getCrewProfiles } from "@/lib/portal-data";
import { bookingStatus, CHIP_CLASS, fmtDates, money } from "@/lib/portal-status";
import { isAttending } from "@/lib/types";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ExtraNightsButton } from "@/components/portal/extra-nights-button";
import { MemberDocuments } from "@/components/portal/member-documents";
import { MemberGallery } from "@/components/portal/member-gallery";
import { TripAddons } from "@/components/portal/trip-addons";
import { PaymentPlan } from "@/components/portal/payment-plan";
import { CancelTrip } from "@/components/portal/cancel-trip";
import { RedeemVoucher } from "@/components/portal/redeem-voucher";
import { CrewCard } from "@/components/portal/crew-card";
import { InvitePanel } from "@/components/portal/invite-panel";
import { getInvitesForBooking, resolveRewards } from "@/lib/invites";
import { computePaymentPlan } from "@/lib/payments";
import { describePrice } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "My trip — NP7" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function BookingDetail({ params }: Props) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const b = await getMemberBooking(user.contactId, id);
  if (!b) notFound();

  const chip = bookingStatus(b);
  const [photos, paid, hotel, coaches, downloadsRemaining, addonsTotal, flights, arrival, crew] = await Promise.all([
    b.edition?.id ? getMemoryPhotosForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([]),
    getBookingPaid(b.id).catch(() => 0),
    getBookingHotel(b.id).catch(() => null),
    b.edition?.id ? getEditionCoaches(b.edition.id).catch(() => []) : Promise.resolve([]),
    getMemoryDownloadsRemaining(b.id).catch(() => 3),
    getConfirmedAddonsTotal(b.id).catch(() => 0),
    getBookingFlights(b.id).catch(() => null),
    b.experience_id ? getExperienceArrivalInfo(b.experience_id).catch(() => null) : Promise.resolve(null),
    b.edition?.id ? getCrewProfiles(b.edition.id, user.contactId).catch(() => ({ going: 0, sharing: 0, profiles: [] })) : Promise.resolve({ going: 0, sharing: 0, profiles: [] }),
  ]);

  const baseTotal = b.agreed_price ?? null;
  const total = baseTotal != null ? baseTotal + addonsTotal : addonsTotal > 0 ? addonsTotal : null;
  // How the member's price compares to the package list (+ confirmed add-ons):
  // a discount, an exact match, or a negotiated "as discussed" figure.
  const priceLabel = describePrice({ agreedPrice: b.agreed_price, packagePrice: b.pkg?.price ?? null, addonsTotal });
  const tripEnded = b.edition?.date_end ? new Date(b.edition.date_end) < new Date() : false;
  // waiver signature status (table from migration 031)
  const waiverSig = await (createAdminClient() as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { signed_name: string; signed_at: string } | null }> } } } })
    .from("exp_waiver_signatures").select("signed_name, signed_at").eq("booking_id", id).maybeSingle()
    .then((r) => r.data).catch(() => null);
  // Invite-a-friend: the member's existing invites for this booking + the reward
  // amounts (per-edition override, else default). Tolerant of migration 050.
  const inviteData = await (async () => {
    const fallback = { invites: [] as Awaited<ReturnType<typeof getInvitesForBooking>>, friend: 100, inviter: 100, currency: b.experience?.currency || "EUR" };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      const [invites, edRes] = await Promise.all([
        getInvitesForBooking(b.id),
        b.edition?.id ? db.from("exp_editions").select("invite_reward_friend,invite_reward_inviter").eq("id", b.edition.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const r = resolveRewards(edRes?.data ?? null);
      return { invites, friend: r.friend, inviter: r.inviter, currency: b.experience?.currency || "EUR" };
    } catch {
      return fallback;
    }
  })();

  const cancellation = b.experience?.cancellation_policy ||
    "You can cancel any time before the trip. Your deposit is refundable for 14 days after payment; after that it's kept as the cancellation fee. Once you've paid the 50% downpayment or the full balance, that amount becomes the fee — with a goodwill credit voucher toward a future trip. Use ‘Cancel this trip’ above to start, or see our Terms for the full scale.";
  // Pull the package's payment config so the member's plan matches the invoices
  // exactly: package deposit (which can be 0 → a clean 2-stage plan), down-payment
  // %, and final-payment timing. An edition-level deposit, if set, overrides the
  // package's. Tolerant: pre-migration / missing → falls back to defaults.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payCfg: any = await (createAdminClient() as any)
    .from("exp_bookings")
    .select("exp_packages(deposit,downpayment_percent,final_days_before,deposit_refund_days)")
    .eq("id", id)
    .maybeSingle()
    .then((r: { data: { exp_packages: unknown } | null }) => r.data?.exp_packages ?? null)
    .catch(() => null);
  const plan = computePaymentPlan(
    {
      deposit: b.edition?.deposit ?? payCfg?.deposit ?? null,
      downpayment_percent: payCfg?.downpayment_percent ?? null,
      final_days_before: payCfg?.final_days_before ?? null,
      deposit_refund_days: payCfg?.deposit_refund_days ?? null,
    },
    { total: total ?? 0, paidAmount: paid, editionStart: b.edition?.date_start ?? null }
  );

  // "Secured" = the first real payment milestone is paid (the deposit, or — when
  // the package has no deposit — the down-payment), which unlocks trip add-ons.
  const depositMilestone = plan.find((m) => m.kind === "deposit");
  const depositPaid =
    (depositMilestone ? depositMilestone.status === "paid" : paid > 0) ||
    b.downpayment_received ||
    isAttending(b.status);

  const memoriesContent = (photos.length === 0 && !b.edition?.memories_video_url) ? (
    <p className="text-[13.5px] text-[#9aa6ac]">Your photos &amp; video will appear here after the week.</p>
  ) : (
    <>
      {photos.length > 0 && (
        <div className="mb-3">
          <MemberGallery photos={photos} bookingId={b.id} downloadsRemaining={downloadsRemaining} />
        </div>
      )}
      {b.edition?.memories_video_url && (
        <a href={b.edition.memories_video_url} target="_blank" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#00afdb] hover:underline">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Watch your week&apos;s video</a>
      )}
    </>
  );

  // ── Trip phase: drives ordering. Once the trip has STARTED, photos lead and the
  //    pre-trip cards fold away; once it's ENDED, we nudge a review. ──
  const now = new Date();
  const startsAt = b.edition?.date_start ? new Date(b.edition.date_start) : null;
  const tripStarted = startsAt ? startsAt <= now : false; // live OR ended
  const daysToGo = startsAt ? Math.max(0, Math.ceil((startsAt.getTime() - now.getTime()) / 86400000)) : null;
  const cur = b.experience?.currency ?? "EUR";
  const fullyPaid = total != null && total > 0 && paid >= total;
  const nextMilestone = plan.find((m) => m.status !== "paid");

  // The single "what now?" the member should focus on.
  type Tone = "coral" | "amber" | "green" | "cyan";
  let hero: { eyebrow: string; title: string; body: string; ctaLabel?: string; ctaHref?: string; tone: Tone };
  if (tripEnded) {
    hero = { eyebrow: "Your week", title: "Relive it 🌊", body: "Your photos and video from the trip are ready below.", ctaLabel: "See my photos", ctaHref: "#photos", tone: "cyan" };
  } else if (tripStarted) {
    hero = { eyebrow: "Happening now", title: "You're on the water 🌊", body: "Have an epic week — your crew, photos and trip details are all here.", ctaLabel: "See your crew", ctaHref: "#crew", tone: "cyan" };
  } else if (fullyPaid) {
    hero = { eyebrow: "You're all set", title: daysToGo != null ? `${daysToGo} ${daysToGo === 1 ? "day" : "days"} to go 🎉` : "You're all set 🎉", body: "Everything's paid. Check your packing list and arrival info so you're ready to ride.", ctaLabel: "Open trip prep", ctaHref: "#prep", tone: "green" };
  } else if (!depositPaid && nextMilestone) {
    hero = { eyebrow: "Your next step", title: "Secure your spot", body: `Pay the ${money(nextMilestone.amount, cur)} downpayment to lock in your place — fully refundable for 14 days.`, ctaLabel: "View payment plan", ctaHref: "#payment", tone: "coral" };
  } else if (nextMilestone) {
    hero = { eyebrow: "Your next step", title: `Balance due — ${money(nextMilestone.amount, cur)}`, body: `Pay by bank transfer${nextMilestone.dueDate ? ` (due ${new Date(nextMilestone.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : ""}. The bank details are in your payment plan.`, ctaLabel: "View payment plan", ctaHref: "#payment", tone: "amber" };
  } else {
    hero = { eyebrow: "You're all set", title: "You're set 🎉", body: "Everything's sorted for your trip.", ctaLabel: "Open trip prep", ctaHref: "#prep", tone: "green" };
  }

  // Quick-jump chips — an overview + a hint that there's more below.
  const chips = [
    ...(tripStarted ? [{ label: "Photos", href: "#photos" }] : []),
    { label: "Payment", href: "#payment" },
    ...(!tripStarted ? [{ label: "Prep", href: "#prep" }] : []),
    ...(hotel ? [{ label: "Stay", href: "#stay" }] : []),
    ...(coaches.length ? [{ label: "Team", href: "#team" }] : []),
    ...(crew.going > 1 || b.edition?.whatsapp_group_link ? [{ label: "Crew", href: "#crew" }] : []),
    { label: "Docs", href: "#docs" },
  ];

  // The payment-plan body (used open pre-trip, folded into an accordion after start).
  const paymentBody = (
    <>
      <Row label="Package" value={b.pkg?.name ?? "—"} />
      {addonsTotal > 0 && <Row label="Confirmed add-ons" value={`+ ${money(addonsTotal, cur)}`} />}
      {priceLabel.kind === "discount" && (
        <Row label="Your rate" value={
          <>
            <span className="line-through text-[#9aa6ac] font-semibold mr-2">{money(priceLabel.list, cur)}</span>
            {money(priceLabel.total, cur)}
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-green-100 text-green-700 align-middle">{priceLabel.percentOff}% off</span>
          </>
        } />
      )}
      {priceLabel.kind === "as_discussed" && (
        <Row label="Your price" value={
          <>
            {money(priceLabel.total, cur)}
            <span className="ml-2 text-[12px] font-medium text-[#9aa6ac] align-middle">as discussed</span>
          </>
        } />
      )}
      <div className="mt-3.5">
        <PaymentPlan milestones={plan} currency={cur} total={total ?? 0} paid={paid} />
      </div>
      {!tripEnded && paid < (total ?? 0) && (
        <div className="mt-4 pt-3 border-t border-[#f3ede2]"><RedeemVoucher bookingId={b.id} /></div>
      )}
      {!tripEnded && (
        <div className="mt-4 pt-3 border-t border-[#f3ede2] flex items-center justify-between gap-3">
          <span className="text-[12px] text-[#9aa6ac] leading-snug">Plans changed?</span>
          <CancelTrip bookingId={b.id} milestones={plan} paid={paid} currency={cur} />
        </div>
      )}
    </>
  );
  // The waiver body (also shown collapsed, with a status badge in the header).
  const waiverBody = waiverSig ? (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 w-7 h-7 rounded-full bg-green-500 text-white grid place-items-center text-[14px] font-bold">✓</span>
      <div>
        <p className="text-[14px] font-bold text-[#00374a]">Signed</p>
        <p className="text-[12.5px] text-[#8a9aa0]">by {waiverSig.signed_name} · {new Date(waiverSig.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      <Link href={`/account/bookings/${b.id}/waiver`} className="ml-auto text-[13px] font-semibold text-[#00afdb] hover:underline">View</Link>
    </div>
  ) : (
    <div>
      <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mb-3">Every participant signs a short waiver &amp; health declaration before the trip — it takes a minute, right here in your account.</p>
      <Link href={`/account/bookings/${b.id}/waiver`} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">Sign your waiver →</Link>
    </div>
  );

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec] overflow-x-clip">
        <div className="max-w-[780px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <Link href="/account/trips" className="text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a]">← My trips</Link>

          <div className="flex flex-wrap items-start justify-between gap-3 mt-3 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">{b.experience?.title ?? "Your trip"}</h1>
              <p className="text-[15px] text-[#6a7a80] mt-1.5">{b.edition?.label ? `${b.edition.label} · ` : ""}{fmtDates(b.edition?.date_start, b.edition?.date_end)}</p>
            </div>
            <span className={`inline-block px-3.5 py-1.5 rounded-full text-[12px] font-bold ${CHIP_CLASS[chip.tone]}`}>{chip.label}</span>
          </div>

          {/* Next step — the one thing to focus on right now */}
          <NextStepHero {...hero} />

          {/* Quick jump — an overview, and a hint there's more below */}
          <QuickChips items={chips} />

          <div className="mt-5 space-y-4">
            {/* once the trip has started, photos lead */}
            {tripStarted && <Card id="photos" title="Your memories">{memoriesContent}</Card>}

            {/* review nudge — once the week is over */}
            {tripEnded && (
              <section className="bg-gradient-to-br from-[#00afdb] to-[#0782a0] rounded-2xl p-6 text-white">
                <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/80 mb-2">How was it?</h2>
                <p className="text-[15px] font-bold leading-snug mb-1">Loved your week? Leave a review.</p>
                <p className="text-[13.5px] text-white/85 leading-relaxed mb-4">It takes a minute and helps other riders find their next trip. You can add a photo too.</p>
                <Link href={`/account/bookings/${b.id}/review`} className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-transform">Leave a review</Link>
              </section>
            )}

            {/* payment — open & prominent before the trip; folded once it's underway */}
            {!tripStarted ? (
              <Card id="payment" title="Payment plan">{paymentBody}</Card>
            ) : (
              <Accordion id="payment" title="Payment" badge={fullyPaid ? { text: "Paid", tone: "green" } : nextMilestone ? { text: `${money(nextMilestone.amount, cur)} due`, tone: "amber" } : undefined}>{paymentBody}</Accordion>
            )}

            {/* trip prep — open before the trip */}
            {!tripStarted && (
              <Card id="prep" title="Trip prep">
                <TripAddons bookingId={b.id} depositPaid={depositPaid} initialFlights={flights} arrival={arrival} editionStart={b.edition?.date_start ?? null} editionEnd={b.edition?.date_end ?? null} />
                <div className="mt-5 pt-4 border-t border-[#f3ede2]"><ExtraNightsButton bookingId={b.id} /></div>
              </Card>
            )}

            {/* secondary sections — collapsed accordions, but their headers still show status */}
            <Accordion id="waiver" title="Participation waiver" defaultOpen={!waiverSig && !tripStarted} badge={waiverSig ? { text: "Signed", tone: "green" } : { text: "Action needed", tone: "amber" }}>{waiverBody}</Accordion>

            {hotel && (
              <Accordion id="stay" title="Your stay">
                {hotel.image_url && <div className="rounded-xl overflow-hidden mb-3 aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${hotel.image_url}')` }} />}
                <p className="text-[15px] font-bold text-[#00374a]">{hotel.name}</p>
                {hotel.description && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-1.5 whitespace-pre-line">{hotel.description}</p>}
                {hotel.website && <a href={hotel.website} target="_blank" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#00afdb] hover:underline mt-2">Hotel website ↗</a>}
              </Accordion>
            )}

            {coaches.length > 0 && (
              <Accordion id="team" title="Your team" badge={{ text: String(coaches.length), tone: "cyan" }}>
                <div className="space-y-4">
                  {coaches.map((c) => (
                    <div key={c.name} className="flex items-start gap-3">
                      <div className="w-14 h-14 rounded-full bg-cover bg-center shrink-0 bg-[#eef3f4]" style={{ backgroundImage: c.image ? `url('${c.image}')` : undefined }} />
                      <div className="min-w-0">
                        <p className="text-[14.5px] font-bold text-[#00374a]">{c.name}</p>
                        {c.role && <p className="text-[11px] font-bold tracking-wide uppercase text-[#00afdb]">{c.role}</p>}
                        {c.bio && <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-1">{c.bio}</p>}
                        {c.whatsapp && (
                          <a href={normalizeWa(c.whatsapp)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 mt-1.5 text-[13px] font-semibold text-[#1aa851] hover:underline">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                            Chat on WhatsApp
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Accordion>
            )}

            {(crew.going > 1 || b.edition?.whatsapp_group_link) && (
              <div id="crew" className="scroll-mt-20">
                <CrewCard bookingId={b.id} going={crew.going} sharing={crew.sharing} profiles={crew.profiles} whatsappLink={b.edition?.whatsapp_group_link ?? null} />
              </div>
            )}

            {!tripEnded && (
              <Accordion id="invite" title="Invite a friend" badge={{ text: `${money(inviteData.friend, inviteData.currency)} off`, tone: "green" }}>
                <InvitePanel bookingId={b.id} rewardFriend={inviteData.friend} rewardInviter={inviteData.inviter} currency={inviteData.currency} initialInvites={inviteData.invites} />
              </Accordion>
            )}

            <Accordion id="docs" title="Travel documents">
              <DocLink href={`/account/bookings/${b.id}/confirmation`} label="Trip confirmation" sub="Your booking summary (print / save as PDF)" />
              <DocLink href="/experience/legal/package-travel" label="Standard information form" sub="Your rights under EU package-travel law" />
              <MemberDocuments bookingId={b.id} />
              <details className="mt-2 border-t border-[#f3ede2] pt-3">
                <summary className="text-[14px] font-semibold text-[#00374a] cursor-pointer">Cancellation policy</summary>
                <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-2 whitespace-pre-line">{cancellation}</p>
              </details>
            </Accordion>

            <Accordion id="help" title="Need anything?">
              <p className="text-[14px] text-[#5a6b72] leading-relaxed">We&apos;re here for you personally. Reply to any of our emails or reach us at <a href="mailto:experience@np-seven.com" className="text-[#00afdb] font-semibold">experience@np-seven.com</a>.</p>
            </Accordion>

            {/* before the trip there are no photos yet — keep memories at the bottom */}
            {!tripStarted && <Accordion id="photos" title="Your memories" badge={{ text: "after the week", tone: "slate" }}>{memoriesContent}</Accordion>}
          </div>
        </div>
      </main>
    </>
  );
}

function Card({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-[#f0e6d6] p-6 scroll-mt-20">
      <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-4">{title}</h2>
      {children}
    </section>
  );
}

const HERO_TONES: Record<"coral" | "amber" | "green" | "cyan", { bar: string; eyebrow: string; btn: string }> = {
  coral: { bar: "#d85a30", eyebrow: "#993c1d", btn: "bg-[#0f6e56] hover:bg-[#0c5d49]" },
  amber: { bar: "#ca8a04", eyebrow: "#854f0b", btn: "bg-[#0f6e56] hover:bg-[#0c5d49]" },
  green: { bar: "#1d9e75", eyebrow: "#0f6e56", btn: "bg-[#0f6e56] hover:bg-[#0c5d49]" },
  cyan: { bar: "#00afdb", eyebrow: "#0782a0", btn: "bg-[#00afdb] hover:bg-[#15c0ec]" },
};
/** The single "what now?" card at the top — phase + payment aware. */
function NextStepHero({ eyebrow, title, body, ctaLabel, ctaHref, tone }: { eyebrow: string; title: string; body: string; ctaLabel?: string; ctaHref?: string; tone: "coral" | "amber" | "green" | "cyan" }) {
  const t = HERO_TONES[tone];
  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-6" style={{ borderLeftWidth: 4, borderLeftColor: t.bar }}>
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: t.eyebrow }}>{eyebrow}</p>
      <h2 className="text-[19px] sm:text-[21px] font-black text-[#00374a] mt-1 leading-tight">{title}</h2>
      <p className="text-[14px] text-[#5a6b72] leading-relaxed mt-1.5">{body}</p>
      {ctaLabel && ctaHref && (
        <a href={ctaHref} className={`inline-flex items-center gap-1.5 mt-3.5 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white ${t.btn} transition-colors`}>
          {ctaLabel}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </a>
      )}
    </section>
  );
}

/** A horizontal, scrollable row of anchor chips — overview + "there's more". */
function QuickChips({ items }: { items: { label: string; href: string }[] }) {
  return (
    <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((c) => (
        <a key={c.href} href={c.href} className="shrink-0 rounded-full bg-white border border-[#e7dcc9] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#00374a] hover:border-[#00afdb] hover:text-[#00afdb] transition-colors">{c.label}</a>
      ))}
    </div>
  );
}

const BADGE_TONES: Record<"green" | "amber" | "cyan" | "slate", string> = {
  green: "bg-[#e1f5ee] text-[#0f6e56]",
  amber: "bg-[#fdebd0] text-[#9a6b16]",
  cyan: "bg-[#e3f5fb] text-[#0782a0]",
  slate: "bg-[#eef2f3] text-[#8a9aa0]",
};
/** A collapsible section. Collapsed by default (the "accordion" the page wants),
 *  but the header still shows a status badge so nothing's truly hidden. */
function Accordion({ id, title, badge, defaultOpen, children }: { id?: string; title: string; badge?: { text: string; tone: "green" | "amber" | "cyan" | "slate" }; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details id={id} open={defaultOpen} className="group bg-white rounded-2xl border border-[#f0e6d6] scroll-mt-20 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center gap-3 p-5 cursor-pointer list-none select-none">
        <h2 className="flex-1 text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb]">{title}</h2>
        {badge && <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${BADGE_TONES[badge.tone]}`}>{badge.text}</span>}
        <svg className="w-5 h-5 text-[#c0ccd0] acc-chevron shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="px-5 pb-5 -mt-1">{children}</div>
    </details>
  );
}
/** Normalise a stored WhatsApp value (wa.me/…, a full URL, or a raw number) into a tappable link. */
function normalizeWa(v: string): string {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^wa\.me\//i.test(s)) return `https://${s}`;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : s;
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "green" | "amber" }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[#f7f1e7] last:border-0">
      <span className="text-[13.5px] text-[#6a7a80]">{label}</span>
      <span className={`text-[13.5px] font-bold text-right ${tone === "green" ? "text-green-700" : tone === "amber" ? "text-[#c4621a]" : "text-[#00374a]"}`}>{value}</span>
    </div>
  );
}
function DocLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-2.5 group">
      <span className="shrink-0 w-9 h-9 rounded-lg bg-[#00afdb]/10 text-[#00afdb] grid place-items-center">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-[#00374a] group-hover:text-[#00afdb] transition-colors">{label}</span>
        <span className="block text-[12px] text-[#9aa6ac]">{sub}</span>
      </span>
      <svg className="w-4 h-4 text-[#c9d4d8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}
