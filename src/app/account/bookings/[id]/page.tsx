import Link from "next/link";
import { defaultCancellationPolicy } from "@/lib/cancellation-policy";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getMemberBooking, getTripGalleryGroupsForBooking, getTripVideosForBooking, getBookingPhotoSharing, getBookingPaid, getBookingHotel, getBookingStay, getEditionCoaches, getMemoryDownloadsRemaining, getConfirmedAddonsTotal, getBookingFlights, getExperienceArrivalInfo, getCrewProfiles, getPreTripContent, getGuidesForBooking } from "@/lib/portal-data";
import { bookingStatus, fmtDates, money, isSecured } from "@/lib/portal-status";
import { isAttending } from "@/lib/types";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { ExtraNightsButton } from "@/components/portal/extra-nights-button";
import { MemberDocuments } from "@/components/portal/member-documents";
import { MemberGallery } from "@/components/portal/member-gallery";
import { TripVideoGrid } from "@/components/portal/trip-video-grid";
import { PhotoSharingToggle } from "@/components/portal/photo-sharing-toggle";
import { TripAddons } from "@/components/portal/trip-addons";
import { PaymentPlan } from "@/components/portal/payment-plan";
import { TripView, type TripTab, type TripTile } from "@/components/portal/trip-view";
import { TripHero } from "@/components/portal/trip-hero";
import { hasFlightDetails } from "@/lib/flights";
import { CancelTrip } from "@/components/portal/cancel-trip";
import { RedeemVoucher } from "@/components/portal/redeem-voucher";
import { CrewCard } from "@/components/portal/crew-card";
import { InvitePanel } from "@/components/portal/invite-panel";
import { getInvitesForBooking, resolveRewards } from "@/lib/invites";
import { computePaymentPlan, amountDueNow, addDays, PAYMENT_DEFAULTS, type Milestone } from "@/lib/payments";
import { describePrice } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase";
import { PackingChecklist } from "@/components/portal/packing-checklist";

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
  const [galleryGroups, paid, hotel, stay, coaches, downloadsRemaining, addonsTotal, flights, arrival, crew, photosShared, preTrip, tripVideos, guides] = await Promise.all([
    b.edition?.id ? getTripGalleryGroupsForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([]),
    getBookingPaid(b.id).catch(() => 0),
    getBookingHotel(b.id).catch(() => null),
    getBookingStay(b.id).catch(() => null),
    b.edition?.id ? getEditionCoaches(b.edition.id).catch(() => []) : Promise.resolve([]),
    getMemoryDownloadsRemaining(b.id).catch(() => 3),
    getConfirmedAddonsTotal(b.id).catch(() => 0),
    getBookingFlights(b.id).catch(() => null),
    b.experience_id ? getExperienceArrivalInfo(b.experience_id).catch(() => null) : Promise.resolve(null),
    b.edition?.id ? getCrewProfiles(b.edition.id, user.contactId).catch(() => ({ going: 0, sharing: 0, profiles: [] })) : Promise.resolve({ going: 0, sharing: 0, profiles: [] }),
    getBookingPhotoSharing(b.id).catch(() => true),
    b.experience_id ? getPreTripContent(b.experience_id).catch(() => ({ packingList: null, preTripNote: null })) : Promise.resolve({ packingList: null, preTripNote: null }),
    b.edition?.id ? getTripVideosForBooking(b.edition.id, b.id).catch(() => []) : Promise.resolve([]),
    getGuidesForBooking(b.id).catch(() => []),
  ]);
  const packingItems = (preTrip.packingList ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

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

  // Pull the package's payment config so the member's plan matches the invoices
  // exactly: package deposit (which can be 0 → a clean 2-stage plan), down-payment
  // %, and final-payment timing. An edition-level deposit, if set, overrides the
  // package's. Tolerant: pre-migration / missing → falls back to defaults.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payRow: any = await (createAdminClient() as any)
    .from("exp_bookings")
    .select("created_at, exp_packages(deposit,downpayment_percent,final_days_before,deposit_refund_days)")
    .eq("id", id)
    .maybeSingle()
    .then((r: { data: { created_at: string | null; exp_packages: unknown } | null }) => r.data ?? null)
    .catch(() => null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payCfg: any = payRow?.exp_packages ?? null;
  const plan = computePaymentPlan(
    {
      deposit: b.edition?.deposit ?? payCfg?.deposit ?? null,
      downpayment_percent: payCfg?.downpayment_percent ?? null,
      final_days_before: payCfg?.final_days_before ?? null,
      deposit_refund_days: payCfg?.deposit_refund_days ?? null,
    },
    // bookedAt anchors the no-deposit downpayment deadline (registration + X days).
    { total: total ?? 0, paidAmount: paid, editionStart: b.edition?.date_start ?? null, bookedAt: payRow?.created_at ?? null }
  );

  // "Secured" = the first real payment milestone is paid (the deposit, or — when
  // the package has no deposit — the down-payment), which unlocks trip add-ons.
  const depositMilestone = plan.find((m) => m.kind === "deposit");
  const depositPaid =
    (depositMilestone ? depositMilestone.status === "paid" : paid > 0) ||
    b.downpayment_received ||
    isAttending(b.status);
  // Deposit vs down-payment: many packages have NO deposit (the % down-payment is
  // the first, refundable securing payment). Labels must reflect the real config
  // — never say "deposit" when the securing payment is the down-payment.
  const hasDeposit = !!depositMilestone;
  // Same rule the confirmation document uses, so the tab label and the document
  // it opens can never disagree.
  const secured = isSecured(b);
  const securingLabel = hasDeposit ? "Pay your deposit" : "Secure your spot";

  // Cancellation copy — deposit-aware: many trips have no deposit (the 50%
  // downpayment is the first, 14-day-refundable payment), so don't mention one.
  const cancellation = b.experience?.cancellation_policy || defaultCancellationPolicy(!!depositMilestone);

  const photoCount = galleryGroups.reduce((n, g) => n + g.photos.length, 0);
  const memoriesContent = (photoCount === 0 && !b.edition?.memories_video_url && tripVideos.length === 0) ? (
    <p className="text-[13.5px] text-[#9aa6ac]">Your photos &amp; video will appear here after the week.</p>
  ) : (
    <>
      {photoCount > 0 && (
        <div className="mb-3">
          <MemberGallery groups={galleryGroups} bookingId={b.id} downloadsRemaining={downloadsRemaining} keeperBookingId={b.id}
            trip={{
              // strip the brand prefix ("NP7 Experience …", "NP7 Signature EXP - …") —
              // the card already carries the NP7 Experience logo, so the title is just the place
              title: (b.experience?.title ?? "").replace(/^NP7\s*(Signature\s+)?(Experience|EXP)\b\s*[-–—·:]*\s*/i, "").trim() || "NP7 Experience",
              sub: b.edition?.date_start ? new Date(b.edition.date_start).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : undefined,
            }} />
          <div className="mt-3">
            <PhotoSharingToggle bookingId={b.id} initialShared={photosShared} />
          </div>
        </div>
      )}
      {b.edition?.memories_video_url && (
        <a href={b.edition.memories_video_url} target="_blank" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#00afdb] hover:underline">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Watch your week&apos;s video</a>
      )}
      {/* individual clips — the same grid (and keeper stars) as Account → Memories */}
      <TripVideoGrid videos={tripVideos} bookingId={b.id} />
    </>
  );

  // ── Trip phase: drives ordering. Once the trip has STARTED, photos lead and the
  //    pre-trip cards fold away; once it's ENDED, we nudge a review. ──
  const now = new Date();
  const startsAt = b.edition?.date_start ? new Date(b.edition.date_start) : null;
  const tripStarted = startsAt ? startsAt <= now : false; // live OR ended
  const daysToGo = startsAt ? Math.max(0, Math.ceil((startsAt.getTime() - now.getTime()) / 86400000)) : null;
  const cur = b.experience?.currency ?? "EUR";
  // A 1–2 day clinic (edition kind='event') is bought outright at checkout —
  // no flights to declare, no packing list, no deposit→balance plan. Keep what
  // it DOES have: the waiver (guardian for minors), documents and photos.
  const isEvent = b.edition?.kind === "event";
  const fullyPaid = total != null && total > 0 && paid >= total;
  const nextMilestone = plan.find((m) => m.status !== "paid");
  // An event ticket used to be all-or-nothing, so anything short of the full
  // price read as "payment pending — book again". A rider who paid the €100
  // deposit on a €400 clinic is SECURED, and telling them to book again would
  // have taken a second €100. Part-paid = money in, money still owed.
  const eventPartPaid = isEvent && !fullyPaid && paid > 0.01;
  const eventOutstanding = Math.max(0, (total ?? 0) - paid);
  /*
   * A clinic cancels under the SAME policy as a trip, so it uses the same
   * component — it just has one payment rather than a deposit→balance ladder.
   * Expressed as a single refundable milestone, CancelTrip's existing branches
   * come out right: nothing paid is free, inside the window is a full refund,
   * past it the amount paid is the cancellation fee. The window is anchored to
   * the booking, because a clinic ticket is paid at checkout.
   */
  const eventRefundDays = payCfg?.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays;
  const eventBookedAt: string | null = payRow?.created_at ? String(payRow.created_at).slice(0, 10) : null;
  const eventCancelMilestones: Milestone[] = [{
    kind: "deposit",
    label: "Ticket",
    amount: total ?? 0,
    cumulative: total ?? 0,
    dueDate: null,
    dueLabel: "Pay to secure your spot",
    status: paid > 0.01 ? "paid" : "due",
    refundableUntil: eventBookedAt ? addDays(eventBookedAt, eventRefundDays) : null,
  }];
  const eventBalanceDue = plan.find((m) => m.kind === "final")?.dueDate ?? null;
  const eventBalanceDueLabel = eventBalanceDue
    ? new Date(`${eventBalanceDue}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  // What to actually transfer — the milestone MINUS what has already landed
  // against it. The nominal slice would tell a member who has overpaid the
  // down-payment to send the full half again. Falls back to the slice only when
  // we have no ledger to work from.
  const dueNow = amountDueNow(plan, paid) ?? nextMilestone?.amount ?? 0;

  // Immersive hero: cover photo (the edition's own tile wins, then the
  // experience's) + a phase-aware countdown with a wait-progress bar (booked → go).
  const coverImage = b.edition?.hero_image ?? b.experience?.hero_image ?? null;
  const weeks = daysToGo != null ? Math.floor(daysToGo / 7) : null;
  const bookedAt = payRow?.created_at ? new Date(payRow.created_at) : null;
  const waitPct = bookedAt && startsAt && startsAt.getTime() > bookedAt.getTime()
    ? Math.max(4, Math.min(100, Math.round(((now.getTime() - bookedAt.getTime()) / (startsAt.getTime() - bookedAt.getTime())) * 100)))
    : null;
  const tripPhase: "before" | "during" | "after" = tripEnded ? "after" : tripStarted ? "during" : "before";

  // The single "what now?" the member should focus on.
  type Tone = "coral" | "amber" | "green" | "cyan";
  let hero: { eyebrow: string; title: string; body: string; ctaLabel?: string; ctaHref?: string; tone: Tone };
  if (tripEnded) {
    hero = { eyebrow: "Your week", title: "Relive it 🌊", body: "Your photos and video from the trip are ready below.", tone: "cyan" };
  } else if (tripStarted) {
    hero = { eyebrow: "Happening now", title: "You're on the water 🌊", body: "Have an epic week — your crew, photos and trip details are all here.", ctaLabel: "See your crew", ctaHref: "#crew", tone: "cyan" };
  } else if (isEvent) {
    // Never a deposit→balance story for a clinic: it was bought outright.
    hero = fullyPaid
      ? { eyebrow: "You're in", title: daysToGo != null ? `${daysToGo} ${daysToGo === 1 ? "day" : "days"} to go 🎉` : "You're in 🎉", body: `Your spot is paid and confirmed.${waiverSig ? "" : " One thing left: sign the waiver."}`, ctaLabel: waiverSig ? "Your documents" : "Sign the waiver", ctaHref: "#docs", tone: "green" }
      : eventPartPaid
        ? { eyebrow: "You're in", title: daysToGo != null ? `${daysToGo} ${daysToGo === 1 ? "day" : "days"} to go 🎉` : "Your spot is secured 🎉", body: `Your deposit is in and your spot is confirmed. The remaining ${money(eventOutstanding, cur)}${eventBalanceDueLabel ? ` is due ${eventBalanceDueLabel}` : " is due before the clinic"}.${waiverSig ? "" : " One thing left: sign the waiver."}`, ctaLabel: "See payment", ctaHref: "#payment", tone: "green" }
        : { eyebrow: "Your next step", title: `Payment pending — ${money(total ?? 0, cur)}`, body: "Your spot isn't secured until the ticket is paid. If you started a payment and it didn't go through, just book again — or reply to your confirmation email and we'll sort it.", tone: "amber" };
  } else if (fullyPaid) {
    hero = { eyebrow: "You're all set", title: daysToGo != null ? `${daysToGo} ${daysToGo === 1 ? "day" : "days"} to go 🎉` : "You're all set 🎉", body: "Everything's paid. Check your packing list and arrival info so you're ready to ride.", ctaLabel: "Open trip prep", ctaHref: "#prep", tone: "green" };
  } else if (!depositPaid && nextMilestone) {
    // Honest loss-aversion: name the real date we hold the place until (from the
    // engine), then reassure with the 14-day refund. No fake scarcity.
    const heldUntil = nextMilestone.dueDate ? new Date(nextMilestone.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null;
    hero = { eyebrow: "Your next step", title: "Secure your spot", body: `Pay the ${money(dueNow, cur)} down-payment to lock in your place${heldUntil ? ` — we hold it for you until ${heldUntil}` : ""}. Fully refundable for 14 days.`, ctaLabel: "See how to pay", ctaHref: "#payment", tone: "coral" };
  } else if (nextMilestone) {
    hero = { eyebrow: "Your next step", title: `Balance due — ${money(dueNow, cur)}`, body: `Pay by bank transfer${nextMilestone.dueDate ? ` (due ${new Date(nextMilestone.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : ""}. The bank details are in your payment plan.`, ctaLabel: "View payment plan", ctaHref: "#payment", tone: "amber" };
  } else {
    hero = { eyebrow: "You're all set", title: "You're set 🎉", body: "Everything's sorted for your trip.", ctaLabel: "Open trip prep", ctaHref: "#prep", tone: "green" };
  }

  // "At a glance" tiles — persistent status strip; each jumps to its tab. Phase-aware.
  const flightsAdded = hasFlightDetails(flights);
  const dueShort = nextMilestone?.dueDate ? new Date(nextMilestone.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  const tiles: TripTile[] = [
    {
      key: "payment", label: "Payment", tab: "payment",
      /*
       * A clinic is bought outright, so it has no deposit→balance milestones.
       * This tile was reading the TRIP plan regardless, and computePaymentPlan
       * falls back to a €300 deposit when the package has none — which is why
       * an $850 ticket showed "USD 300" while the hero and the panel below it
       * both said 850. What is owed on an event is simply what is unpaid.
       */
      value: fullyPaid ? "Paid" : isEvent ? (money(eventOutstanding, cur) ?? "—") : nextMilestone ? (money(dueNow, cur) ?? "—") : "—",
      sub: fullyPaid ? "all done" : isEvent ? (eventPartPaid ? "balance" : "to secure your spot") : dueShort ? `due ${dueShort}` : undefined,
      tone: fullyPaid ? "green" : !depositPaid ? "coral" : "amber",
      done: fullyPaid,
      attention: !fullyPaid && (isEvent || !!nextMilestone),
      cta: fullyPaid ? undefined : isEvent ? "Pay now" : nextMilestone ? (depositPaid ? "Pay balance" : "Pay now") : undefined,
    },
    ...(isEvent ? [] : [{
      key: "flights", label: "Arrival", tab: (tripStarted ? undefined : "prep") as TripTile["tab"],
      value: flightsAdded ? "Added" : "To add",
      sub: flightsAdded ? "tap to review" : "your times",
      tone: (flightsAdded ? "green" : "amber") as TripTile["tone"],
      done: flightsAdded,
      attention: !flightsAdded && !tripStarted,
      cta: !flightsAdded && !tripStarted ? "Add arrival" : undefined,
    }] as TripTile[]),
    {
      key: "waiver", label: "Waiver", tab: isEvent ? "docs" : tripStarted ? undefined : "prep",
      value: waiverSig ? "Signed" : "To sign",
      sub: waiverSig ? "all done" : "1 minute",
      tone: waiverSig ? "green" : "amber",
      done: !!waiverSig,
      attention: !waiverSig && !tripStarted,
      cta: !waiverSig && !tripStarted ? "Sign now" : undefined,
    },
    // Being early is not being alone. "Just you" told the first person to book
    // — the one who took the risk on a new trip — that nobody else wanted it.
    // Until the group is real, say that it's forming, and only ever count up.
    {
      key: "crew", label: "Crew", tab: isEvent ? "crew" : "trip",
      value: crew.going > 1 ? `${crew.going} going` : "Forming",
      sub: crew.going > 1 ? "meet them" : "you're in early — bring a friend",
      tone: "cyan",
    },
  ];

  // The payment-plan body (used open pre-trip, folded into an accordion after start).
  /** A clinic is bought outright — show the receipt, not a milestone plan. */
  const eventPaymentBody = (
    <div className="rounded-2xl border border-[#f0e6d6] bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] text-[#6a7a80]">Ticket</span>
        <span className="text-[18px] font-extrabold text-[#00374a] tabular-nums">{money(total ?? 0, cur)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 mt-2 pt-2 border-t border-[#f3ede2]">
        <span className="text-[14px] font-bold text-[#00374a]">{fullyPaid ? "Status" : "Outstanding"}</span>
        <span className={`text-[15px] font-extrabold tabular-nums ${fullyPaid ? "text-green-600" : "text-[#c9620f]"}`}>
          {fullyPaid ? "Paid in full ✓" : money(Math.max(0, (total ?? 0) - paid), cur)}
        </span>
      </div>
      <p className="text-[12.5px] text-[#9aa6ac] mt-3 leading-relaxed">
        {fullyPaid
          ? "Paid by card at booking. Your receipt came from Stripe; anything else you need is under Docs."
          : eventPartPaid
            ? `Your spot is confirmed. The rest${eventBalanceDueLabel ? ` is due ${eventBalanceDueLabel}` : " is due before the clinic"}.`
            : "Your spot is held once the ticket is paid."}
      </p>
      {/* The panel used to state the amount owed and stop there — the tile said
          "Pay now", switched to this tab, and offered nothing to pay with. The
          balance page re-derives what is outstanding server-side, so the link
          can never carry a stale amount. */}
      {!fullyPaid && b.experience?.slug && (
        <a
          href={`/experience/${b.experience.slug}/balance?booking=${b.id}`}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#00374a] px-5 py-3 text-[14px] font-bold text-white hover:-translate-y-0.5 transition-transform"
        >
          Pay {money(Math.max(0, (total ?? 0) - paid), cur)}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      )}
    </div>
  );

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
      {/* How to pay + the invoice/pro-forma (with the bank details & reference)
          right where the money is — not buried in a separate documents tab. */}
      <div className="mt-4 pt-4 border-t border-[#f3ede2]">
        {!tripEnded && paid < (total ?? 0) && (
          <>
            <p className="text-[13px] font-bold text-[#00374a]">How to pay</p>
            <p className="text-[12.5px] text-[#6a7a80] leading-snug mt-0.5">Pay by <strong className="text-[#00374a]">bank transfer</strong> using the account details and payment reference printed on your invoice below — no need to wait for our email. Send it any time before the due date; we mark it here once it lands.</p>
          </>
        )}
        <MemberDocuments bookingId={b.id} />
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

  // ── Tab content ──────────────────────────────────────────────────────────
  const prepContent = (
    <>
      <TripAddons bookingId={b.id} depositPaid={depositPaid} hasDeposit={hasDeposit} securingLabel={securingLabel} initialFlights={flights} arrival={arrival} editionStart={b.edition?.date_start ?? null} editionEnd={b.edition?.date_end ?? null} groupLink={b.edition?.whatsapp_group_link ?? null} joinedGroup={!!b.wa_group} />
      <div className="mt-5 pt-4 border-t border-[#f3ede2]"><ExtraNightsButton bookingId={b.id} /></div>
      <div className="mt-6 pt-5 border-t border-[#f3ede2]">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2.5">Participation waiver</p>
        {waiverBody}
      </div>
    </>
  );

  const tripContent = (
    <div className="space-y-6">
      {!tripEnded && (
        <TripSoFar
          title={b.experience?.title ?? "Your trip"}
          items={[
            { label: "Spot secured", done: depositPaid },
            { label: "Flights added", done: flightsAdded },
            { label: "Waiver signed", done: !!waiverSig },
            { label: "In the crew chat", done: !!b.wa_group },
          ]}
          weeks={weeks}
          daysToGo={daysToGo}
        />
      )}
      {preTrip.preTripNote && (
        <div className="rounded-2xl border border-[#f0e6d6] bg-[#fffdf8] p-5">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2">A note from Nico</p>
          <p className="text-[14px] text-[#3a4a50] leading-relaxed whitespace-pre-line">{preTrip.preTripNote}</p>
        </div>
      )}
      {/* wind.coach training guide(s) matched to this booking — only when one
          actually landed; no empty promise card. */}
      {guides.length > 0 && (
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2">Your focus points</p>
          <div className="space-y-3">
            {guides.map((g) => (
              /* A guide is coaching, not paperwork — the teaser speaks the
                 guide page's own language: ocean card, sun hairline, the
                 numbered points it actually contains. */
              <a key={g.id} href={`/account/guides/${g.id}`}
                className="group relative block rounded-2xl overflow-hidden p-5 transition-transform hover:scale-[1.01]"
                style={{ background: "linear-gradient(155deg,#00232f,#00374a 55%,#075b7d)" }}>
                <span className="absolute top-0 inset-x-0 h-[3px]" style={{ background: "linear-gradient(90deg,#ffc42e,#f0774a 55%,#00afdb)" }} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-black text-white tracking-tight">{g.trip_label ?? "Your training guide"}</p>
                  <span className="shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-white border border-white/25">
                    {g.focusPointCount} {g.focusPointCount === 1 ? "focus point" : "focus points"}
                  </span>
                </div>
                {g.focusTitles.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {g.focusTitles.map((t, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-[13px] text-white/85">
                        <span className="shrink-0 font-black tabular-nums text-[#ffc42e]">{String(i + 1).padStart(2, "0")}</span>
                        <span className="font-semibold truncate">{t}</span>
                      </li>
                    ))}
                    {g.focusPointCount > g.focusTitles.length && (
                      <li className="text-[12px] text-white/60 pl-7">+ {g.focusPointCount - g.focusTitles.length} more</li>
                    )}
                  </ul>
                )}
                <p className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#8fe6f2] group-hover:text-white transition-colors">
                  Open your guide
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </p>
              </a>
            ))}
          </div>
        </div>
      )}
      {packingItems.length > 0 && <PackingChecklist bookingId={b.id} items={packingItems} />}
      {hotel && (
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2">Your stay</p>
          {hotel.image_url && <div className="rounded-xl overflow-hidden mb-3 aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${hotel.image_url}')` }} />}
          <p className="text-[15px] font-bold text-[#00374a]">{hotel.name}</p>
          {stay && (() => {
            const d = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                <span className="text-[13.5px] text-[#3a4a50]">
                  <strong className="text-[#00374a]">{d(stay.checkIn)}</strong> → <strong className="text-[#00374a]">{d(stay.checkOut)}</strong>
                  <span className="text-[#9aa6ac]"> · {stay.nights} {stay.nights === 1 ? "night" : "nights"}</span>
                </span>
                {stay.hotelConfirmed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[11.5px] font-bold">✓ Confirmed by the hotel</span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#e8f1f3] text-[#5a6b72] text-[11.5px] font-bold">Reserved for you</span>
                )}
              </div>
            );
          })()}
          {hotel.description && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-1.5 whitespace-pre-line">{hotel.description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
            {hotel.website && <a href={hotel.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#00afdb] hover:underline">Hotel website ↗</a>}
            {(() => {
              const maps = hotel.maps_url
                || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.location].filter(Boolean).join(", "))}`;
              return (
                <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#00afdb] hover:underline">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  Open in Maps ↗
                </a>
              );
            })()}
          </div>
        </div>
      )}
      {coaches.length > 0 && (
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-3">Your team</p>
          <div className="space-y-4">
            {coaches.map((c) => (
              <div key={c.name} className="flex items-start gap-4">
                <div className="w-[76px] h-[76px] rounded-2xl bg-cover bg-center shrink-0 bg-[#eef3f4] ring-1 ring-black/[0.04]" style={{ backgroundImage: c.image ? `url('${c.image}')` : undefined }} />
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
        </div>
      )}
      {(crew.going > 1 || b.edition?.whatsapp_group_link) && (
        <div id="crew" className="scroll-mt-28">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2">Your crew</p>
          <CrewCard bookingId={b.id} going={crew.going} sharing={crew.sharing} profiles={crew.profiles} whatsappLink={b.edition?.whatsapp_group_link ?? null} />
        </div>
      )}
      {/* Referral — always available (works past or future: the credit rides to
          the friend's own next trip), tucked into a tap-to-expand gift CTA so it
          never dominates the tab. */}
      <InvitePanel collapsible bookingId={b.id} rewardFriend={inviteData.friend} rewardInviter={inviteData.inviter} currency={inviteData.currency} initialInvites={inviteData.invites} />
    </div>
  );

  // The crew on its own, for an event's Crew tab. Same card the trip tab uses,
  // but it always renders: "nobody has shared a profile yet" is information;
  // a tab that opens onto nothing is a dead end.
  const crewContent = (
    <div className="space-y-6">
      <div id="crew" className="scroll-mt-28">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2">Who&apos;s coming</p>
        <CrewCard bookingId={b.id} going={crew.going} sharing={crew.sharing} profiles={crew.profiles} whatsappLink={b.edition?.whatsapp_group_link ?? null} />
      </div>
      <InvitePanel collapsible bookingId={b.id} rewardFriend={inviteData.friend} rewardInviter={inviteData.inviter} currency={inviteData.currency} initialInvites={inviteData.invites} />
    </div>
  );

  const docsContent = (
    <>
      {/* The waiver lived only in Prep — and an event has no Prep tab, so a
          clinic's tile and the hero CTA both pointed at a section that was
          never rendered. Someone who had paid could not sign, which is the
          entire point of the guardian work. It belongs here for an event. */}
      {isEvent && (
        <div className="mb-5 pb-5 border-b border-[#f3ede2]">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2.5">Participation waiver</p>
          {waiverBody}
        </div>
      )}

      {/* Named for what it is right now. Calling it a confirmation before the
          spot is held is the kind of small lie a guest notices. */}
      <DocLink
        href={`/account/bookings/${b.id}/confirmation`}
        label={secured ? (isEvent ? "Your ticket" : "Trip confirmation") : "Booking summary"}
        sub={secured ? `Your confirmed ${isEvent ? "ticket" : "booking"} (print / save as PDF)` : "What you picked — not a confirmation until your spot is secured"}
      />
      {/* A one-day coaching clinic is not a package tour: no travel, no
          accommodation, nothing bundled. Handing the buyer a package-travel
          information form claims rights this sale doesn't carry. */}
      {!isEvent && <DocLink href="/experience/legal/package-travel" label="Standard information form" sub="Your rights under EU package-travel law" />}
      <p className="text-[12.5px] text-[#9aa6ac] py-2.5">Your invoices &amp; pro-forma are in the <strong className="text-[#6a7a80] font-semibold">Payment</strong> tab.</p>
      <details className="mt-2 border-t border-[#f3ede2] pt-3">
        <summary className="text-[14px] font-semibold text-[#00374a] cursor-pointer">Cancellation policy</summary>
        <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-2 whitespace-pre-line">{cancellation}</p>
      </details>
      <div className="mt-3 pt-3 border-t border-[#f3ede2]">
        <p className="text-[14px] text-[#5a6b72] leading-relaxed">Need anything? We&apos;re here for you personally — reply to any of our emails or reach us at <a href="mailto:experience@np-seven.com" className="text-[#00afdb] font-semibold">experience@np-seven.com</a>.</p>
      </div>
    </>
  );

  const photosContent = (
    <>
      {tripEnded && (
        <div className="mb-5 bg-gradient-to-br from-[#00afdb] to-[#0782a0] rounded-2xl p-6 text-white">
          <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/80 mb-2">How was it?</h2>
          <p className="text-[15px] font-bold leading-snug mb-1">Loved your week? Leave a review.</p>
          <p className="text-[13.5px] text-white/85 leading-relaxed mb-4">It takes a minute and helps other riders find their next trip. You can add a photo too.</p>
          <Link href={`/account/bookings/${b.id}/review`} className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-transform">Leave a review</Link>
        </div>
      )}
      {memoriesContent}
    </>
  );

  // Tabs — phase-aware order + attention dots on anything that needs the member.
  const paymentTab: TripTab = { key: "payment", label: "Payment", attention: !fullyPaid && !depositPaid, content: isEvent ? eventPaymentBody : paymentBody };
  const prepTab: TripTab = { key: "prep", label: "Prep", attention: !flightsAdded || !waiverSig, content: prepContent };
  const tripTab: TripTab = { key: "trip", label: "Trip", content: tripContent };
  const docsTab: TripTab = { key: "docs", label: "Docs", content: docsContent };
  const photosTab: TripTab = { key: "photos", label: "Photos", content: photosContent };
  // An event has no arrival, no rooms and no packing list — but it absolutely
  // has a crew, and seeing who else is coming is half the reason to come. The
  // Crew tile pointed at a "trip" tab that events didn't have, so the tile did
  // nothing at all.
  const crewTab: TripTab = { key: "crew", label: "Crew", content: crewContent };
  const tabs: TripTab[] = isEvent
    ? (tripStarted ? [photosTab, crewTab, docsTab, paymentTab] : [paymentTab, crewTab, docsTab, photosTab])
    : tripStarted ? [photosTab, paymentTab, tripTab, docsTab] : [paymentTab, prepTab, tripTab, docsTab, photosTab];
  const initialTab = tripStarted ? "photos" : isEvent ? (fullyPaid ? "docs" : "payment") : !depositPaid ? "payment" : "prep";

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec] overflow-x-clip">
        <div className="max-w-[780px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <div className="mb-6">
            <TripHero
              coverImage={coverImage}
              title={b.experience?.title ?? "Your trip"}
              eyebrow={isEvent ? "Your event" : "Your trip"}
              dateLabel={`${b.edition?.label ? `${b.edition.label} · ` : ""}${fmtDates(b.edition?.date_start, b.edition?.date_end)}`}
              statusLabel={chip.label}
              phase={tripPhase}
              daysToGo={daysToGo}
              weeks={weeks}
              waitPct={waitPct}
            />
          </div>

          <TripView hero={!tripEnded ? <NextStepHero {...hero} /> : null} tiles={tiles} tabs={tabs} initial={initialTab} title={b.experience?.title ?? "Your trip"} statusLabel={chip.label} />
        </div>
      </main>
    </>
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
/**
 * "Your trip so far" — an endowment / IKEA-effect recap: reflects back what the
 * member has already set up for THIS trip, framed as accomplishment (the setup
 * strip covers the to-do side). Only shows real, completed steps, and only once
 * there's genuine momentum (2+), so it grows with engagement instead of nagging.
 */
function TripSoFar({ title, items, weeks, daysToGo }: { title: string; items: { label: string; done: boolean }[]; weeks: number | null; daysToGo: number | null }) {
  const done = items.filter((i) => i.done);
  if (done.length < 2) return null;
  const togo = weeks != null && weeks >= 2 ? `${weeks} weeks to go` : daysToGo != null ? `${daysToGo} ${daysToGo === 1 ? "day" : "days"} to go` : null;
  return (
    <div className="rounded-2xl border border-[#f0e6d6] bg-white p-5">
      <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#c4621a]">Your trip so far</p>
      <h3 className="text-[17px] font-black tracking-[-0.01em] text-[#00374a] mt-1">{title} is taking shape 🤙</h3>
      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {done.map((i) => (
          <span key={i.label} className="flex items-center gap-2.5 text-[13.5px] text-[#3a4a50]">
            <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-[#d8f3e7] text-[#0f6e56] grid place-items-center text-[11px] font-black leading-none">✓</span>
            {i.label}
          </span>
        ))}
      </div>
      {togo && <p className="mt-3.5 pt-3 border-t border-[#f3ede2] text-[13px] text-[#6a7a80]">Everything&apos;s coming together — <strong className="text-[#00374a]">{togo}</strong>.</p>}
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
