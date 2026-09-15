"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics-client";
import { PackageChoice, type WeekPackage } from "./package-choice";
import { AlreadyBooked, supportMailto, type ConflictKind } from "./already-booked";
import { GearPills } from "./gear-pills";
import { GEAR_LABELS, encodeGearSpec, gearAdjustment, type GearChoice, type GearOptions } from "@/lib/gear-shape";

/** @deprecated The real deposit comes from the package config via /api/register/quote —
    this constant only remains so older imports keep compiling. Do not use for display. */
export const DEPOSIT_EUR = 300;

/**
 * One number rule for every price in this modal.
 *
 * A bare toLocaleString drops a trailing zero, so a gear delta turned 3,647.90
 * into "3,647.9" sitting next to "4,133" and a group total into "7,780.9".
 * Fractional prices stopped being exceptional the day the gear choice shipped.
 * Integers stay plain: "4,133.00" for a week that costs a round number reads
 * like an accounting export, not a price.
 */
const num = (n: number) =>
  Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Quote = {
  price: number;
  deposit: number;
  downpaymentPercent: number;
  refundDays: number;
  /** Spots this plan was computed for: the payer plus the companions the
   *  endpoint could price. 1 unless companions were sent. */
  people?: number;
  /** The gear choice each package in the roster offers, keyed by package id.
   *  Keyed, not positional, so a companion the quote had to drop can never
   *  hand their options to the person after them. */
  gearByPackage?: Record<string, GearOptions | null>;
  milestones: { kind: string; label: string; amount: number; dueLabel: string; dueDate: string | null }[];
};

export type ReserveContext = {
  experienceId: string;
  experienceTitle: string;
  editionId: string | null;
  editionLabel: string | null;
  editionDates: string | null;
  packageId: string;
  level: string;
  accommodation: string;
  price: number;
  /** Gear choice — rental (default) | storage | none; priced server-side. */
  gear?: GearChoice;
  /** Chosen rental tier component id (null = base tier). */
  rentalId?: string | null;
  /** Ticked booking-time extras (component ids) — sent verbatim, priced server-side. */
  extras?: string[];
  extrasLabel?: string | null;
  currency?: string;
  /** Real remaining capacity for this week — drives an honest "spots left" nudge. */
  spotsLeft?: number | null;
  /** Riders already secured for this week — honest social proof, only when high. */
  going?: number | null;
  /** Every package bookable this week — a companion picks their own from these. */
  weekPackages?: WeekPackage[];
};

/**
 * One extra person the payer is booking and paying for.
 *
 * `gear` undefined means untouched, so this package's own baseline. Same rule
 * the picker's `gearTouched` gives the payer: an unanswered question is not an
 * answer, and the baseline is whatever the package price already contains.
 */
type Companion = { firstName: string; lastName: string; email: string; packageId: string; gear?: GearChoice; rentalId?: string | null };

/**
 * Free, low-friction registration. Guests give just First name · Last name ·
 * Email (+ optional marketing consent) — no phone, no payment. Registering
 * creates a lead; the refundable downpayment that SECURES the spot happens later
 * from the member account. Logged-in members skip the form (one-tap register).
 */
export function ReserveModal({ ctx, onClose }: { ctx: ReserveContext; onClose: () => void }) {
  // Group booking: people the payer adds to this booking. Each becomes their
  // own booking, covered by the payer's (migration 198) — one payment plan,
  // one invoice, but a real trip page each.
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [groupConsent, setGroupConsent] = useState(false);
  /* Somebody in the roster is already registered for this week. A note on
     their row, never a screen: the payer's own booking is still fine.

     Keyed on the EMAIL, because the index the server answers with is a position
     in the list that was POSTed, and that list is the roster with the empty
     rows dropped. A payer with a half-typed row above a blocked friend read
     "Ben is already registered" under Anna. The address is the same identity
     on both sides, whatever was filtered out between them. */
  const [companionBlocked, setCompanionBlocked] = useState<null | { email: string; firstName: string; message: string }>(null);
  /* The gear choice each package offers, as the server resolved it. Merged
     across quote responses rather than replaced: a refetch triggered by one
     person must never blank the pills under everybody else. */
  const [gearMap, setGearMap] = useState<Record<string, GearOptions | null>>({});
  const weekPackages = ctx.weekPackages ?? [];
  const canAddPeople = weekPackages.length > 0;
  const addCompanion = () =>
    setCompanions((cs) => (cs.length >= 6 ? cs : [...cs, { firstName: "", lastName: "", email: "", packageId: ctx.packageId }]));
  const setCompanionField = (i: number, field: "firstName" | "lastName" | "email" | "packageId", value: string) => {
    // Editing the roster clears the "already registered" note: the address it
    // was about may be the very thing being fixed.
    setCompanionBlocked(null);
    setCompanions((cs) => cs.map((c, j) => (j !== i ? c
      // Another package can carry another baseline and other rental tiers, so
      // the gear choice cannot survive the switch: it would either price
      // something this package never offered, or read as chosen when it wasn't.
      : field === "packageId" ? { ...c, packageId: value, gear: undefined, rentalId: undefined }
      : { ...c, [field]: value })));
  };
  const setCompanionGear = (i: number, gear: GearChoice, rentalId: string | null) =>
    setCompanions((cs) => cs.map((c, j) => (j === i ? { ...c, gear, rentalId } : c)));
  const removeCompanion = (i: number) => {
    setCompanionBlocked(null);
    setCompanions((cs) => cs.filter((_, j) => j !== i));
  };
  /**
   * The people on this roster, as against the rows on the screen.
   *
   * An untouched row is somebody the payer has not started adding yet: it must
   * not be priced into the plan, counted in "3 spots", or POSTed. A row with
   * ANY content is a real person, so it counts and it has to be finished, which
   * is the other half of the same rule: the submit used to silently drop a row
   * that was missing an email, and the payer left believing that friend was in.
   *
   * One derivation, used by the quote key, the totals, the POST body and the
   * spot counts, so the server can never be sent a different group from the one
   * the payer is reading.
   */
  const hasContent = (c: Companion) => !!(c.firstName.trim() || c.lastName.trim() || c.email.trim());
  const roster = companions.filter(hasContent);
  const rosterIncomplete = roster.some((c) => !c.firstName.trim() || !c.email.trim());
  /** What this spot costs: their own package, plus their own gear delta once
   *  they have actually chosen. Same two parts as the payer's `ctx.price`, and
   *  the same helper, so an upgrade tier can never be priced into the plan
   *  panel and left out of the line above it. */
  const priceOf = (c: Companion) =>
    (weekPackages.find((p) => p.id === c.packageId)?.price ?? 0) +
    gearAdjustment(gearMap[c.packageId], c.gear, c.rentalId ?? null);
  const groupTotal = ctx.price + roster.reduce((sum, c) => sum + priceOf(c), 0);
  const money = (n: number) => `${ctx.currency === "USD" ? "$" : "€"}${num(n)}`;
  /** What a guest calls this trip. Not a disclosure anywhere it appears: they
   *  are the one who picked the week. */
  const tripLabel = `${ctx.experienceTitle}${ctx.editionLabel ? ` · ${ctx.editionLabel}` : ""}`;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  /* Already on this week. Set either before the form is shown (a member, from
     the pre-check) or by a 409 on submit. It replaces the whole form body,
     because there is nothing left to fill in. */
  const [conflict, setConflict] = useState<null | { kind: ConflictKind; tripLabel: string; bookingId?: string; payerName?: string }>(null);
  const [registered, setRegistered] = useState(false);
  /** The companions the SERVER created, as it reported them back. */
  const [created, setCreated] = useState<{ firstName: string; email: string }[]>([]);
  const inFlight = useRef(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  /* The booking the registration made: a member goes straight to it, a new
     guest gets there after the magic link in their welcome mail. */
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [member, setMember] = useState(false);
  const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  // Bot traps. A hidden field a person can never see or tab into, and how long
  // the form was actually open. Both are evidence a MACHINE produced the
  // submission — unlike a fingerprint verdict, neither can mistake a real
  // person for a bot just because they use a VPN or a privacy browser.
  const [trap, setTrap] = useState("");
  const [openedAt] = useState(() => Date.now());

  // The real payment plan for THIS package (deposit, downpayment %, deadlines) —
  // computed server-side by the same engine that drives invoices, so what we
  // promise here always matches what the account shows later. Best-effort: if
  // it fails we just show the generic copy, never block registration.
  //
  // The companions go with it, because the payer's plan covers the whole group.
  // The effect is keyed on everything that MOVES THE MONEY and nothing else, so
  // typing a friend's name never refetches while changing anybody's gear does.
  const payerExtrasKey = (ctx.extras ?? []).join(",");
  const companionSpecKey = roster
    .map((c) => encodeGearSpec({ packageId: c.packageId, gear: c.gear ?? null, rentalId: c.rentalId ?? null }))
    .join(",");
  // The payer's own gear and extras go with it too. The picker folds both into
  // ctx.price, but this modal never forwarded them, so the plan underneath the
  // roster was computed on a total neither of them agreed with.
  const quoteSignature = `${ctx.packageId}·${ctx.gear ?? ""}·${ctx.rentalId ?? ""}·${payerExtrasKey}|${companionSpecKey}`;
  const [quotedSignature, setQuotedSignature] = useState<string | null>(null);
  useEffect(() => {
    const qs = new URLSearchParams({
      packageId: ctx.packageId,
      ...(ctx.editionId ? { editionId: ctx.editionId } : {}),
      ...(ctx.gear ? { gear: ctx.gear } : {}),
      ...(ctx.rentalId ? { rentalId: ctx.rentalId } : {}),
      ...(payerExtrasKey ? { extras: payerExtrasKey } : {}),
      ...(companionSpecKey ? { companions: companionSpecKey } : {}),
    });
    let dead = false;
    fetch(`/api/register/quote?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || !d?.milestones) return;
        setQuote(d);
        setQuotedSignature(quoteSignature);
        if (d.gearByPackage) setGearMap((prev) => ({ ...prev, ...d.gearByPackage }));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [ctx.packageId, ctx.editionId, ctx.gear, ctx.rentalId, payerExtrasKey, companionSpecKey, quoteSignature]);

  // The modal only mounts once the visitor clicks "Reserve" → start of the funnel.
  useEffect(() => {
    track("reserve_start", { package: ctx.packageId, level: ctx.level });
  }, [ctx.packageId, ctx.level]);

  // Who is looking, and whether they are already on this week.
  //
  // Both in one gate: `ready` flips only once the pre-check has answered too,
  // so a member who booked this week in March never sees the form flash before
  // the warning. The pre-check takes no email, only the week. Identity comes
  // from the session, which is what keeps it from being a way to ask whether a
  // named person is going on a given trip.
  useEffect(() => {
    const qs = new URLSearchParams({
      experienceId: ctx.experienceId,
      ...(ctx.editionId ? { editionId: ctx.editionId } : {}),
    });
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()).catch(() => null),
      fetch(`/api/register/existing?${qs}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([me, existing]) => {
        if (me?.loggedIn) {
          setMember(true);
          setFirstName(me.firstName ?? ""); setLastName(me.lastName ?? ""); setEmail(me.email ?? "");
        } else {
          // Returning guest — prefill what they typed last time (their own device;
          // localStorage, never sent anywhere new) so the form isn't a blank slate.
          try {
            const saved = JSON.parse(localStorage.getItem("np7_reserve_guest") || "null");
            if (saved && typeof saved === "object") {
              if (saved.firstName) setFirstName(saved.firstName);
              if (saved.lastName) setLastName(saved.lastName);
              if (saved.email) setEmail(saved.email);
            }
          } catch { /* ignore */ }
        }
        if (me?.loggedIn && existing?.found) {
          setConflict({ kind: existing.kind, tripLabel, bookingId: existing.bookingId, payerName: existing.payerName });
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [ctx.experienceId, ctx.editionId, tripLabel]);

  // How often this screen is reached, and in which tone. It is the number that
  // says whether the by-hand "add someone to my booking" job is worth building.
  useEffect(() => {
    if (conflict) track("register_already_booked", { package: ctx.packageId, kind: conflict.kind });
  }, [conflict, ctx.packageId]);
  useEffect(() => {
    if (companionBlocked) track("register_companion_already_booked", { package: ctx.packageId });
  }, [companionBlocked, ctx.packageId]);

  const symbol = ctx.currency === "EUR" || !ctx.currency ? "€" : `${ctx.currency} `;
  const fmt = (n: number) => `${symbol}${num(n)}`;
  const refundDays = quote?.refundDays ?? 14;
  const reassurance = `No payment now · downpayment fully refundable for ${refundDays} days · cancel anytime.`;
  // How many spots the quote on screen was computed for, and whether that is
  // still the roster. One payer plus their companions is one plan, so the panel
  // must never label a solo plan as the group's while a refetch is in flight.
  const planPeople = quote?.people ?? 1;
  // The head count alone is not enough: a gear change moves the money without
  // moving the roster, and a plan showing superseded milestone amounts at full
  // opacity is the same lie as a solo plan labelled as the group's.
  const planStale = !!quote && (planPeople !== roster.length + 1 || quotedSignature !== quoteSignature);
  const spotsWord = planPeople > 1 ? `all ${planPeople} spots` : "your spot";

  async function go() {
    /*
     * A synchronous latch, not the `submitting` state. setSubmitting is async:
     * a double tap before React repaints fires TWO POSTs, both pass the
     * already-booked read on the server, and both insert. A ref flips on the
     * same tick as the click, so it cannot be raced. It is the common half of
     * the race (one person, one tab); two tabs still need the unique index in
     * supabase/migrations/20260915_246_one_live_booking_per_person_per_week.sql.
     */
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setCompanionBlocked(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: ctx.experienceId,
          editionId: ctx.editionId,
          packageId: ctx.packageId,
          gear: ctx.gear ?? "rental",
          rentalId: ctx.rentalId ?? null,
          extras: ctx.extras ?? [],
          firstName, lastName, email, marketingOptIn,
          trap, filledMs: Date.now() - openedAt,
          companions: roster,
        }),
      });
      const json = await res.json();
      // Already on this week. Not an error, so it never reaches the red line:
      // the payer's own case takes over the whole modal, a companion's becomes
      // a note on their row so the rest of the roster survives.
      if (!res.ok && json?.code === "already_booked" && json.conflict) {
        if (json.conflict.kind === "companion") {
          setCompanionBlocked({
            email: String(json.conflict.email ?? "").trim().toLowerCase(),
            firstName: String(json.conflict.firstName ?? ""),
            message: String(json.error ?? ""),
          });
        } else {
          setConflict({
            kind: json.conflict.kind,
            tripLabel: json.conflict.tripLabel ?? tripLabel,
            bookingId: json.conflict.bookingId,
            payerName: json.conflict.payerName,
          });
        }
        setSubmitting(false);
        return;
      }
      if (!res.ok) { setError(json.error ?? "Something went wrong. Please try again."); setSubmitting(false); return; }
      track("register", { package: ctx.packageId, member });
      if (typeof json.bookingId === "string") setBookingId(json.bookingId);
      /* What the server actually created, never what was typed.
         createCompanionBookings continues past a companion it could not write,
         by design, so a success screen counting local state can promise spots
         nobody holds. */
      setCreated(Array.isArray(json.companions) ? json.companions : []);
      // Remember this guest on their own device so a later reserve is one-tap.
      try { localStorage.setItem("np7_reserve_guest", JSON.stringify({ firstName, lastName, email })); } catch { /* ignore */ }
      setRegistered(true);
      setSubmitting(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    } finally {
      inFlight.current = false;
    }
  }

  /* Pay right after registering.
     The securing payment is the plan's first milestone: the deposit where a
     package has one, otherwise the downpayment. With companions it is the
     GROUP's, because the payer carries everyone. */
  const securingAmount = quote?.milestones[0]?.amount ?? 0;
  const bookingHref = bookingId ? `/account/bookings/${bookingId}#payment` : "/account";
  const loginHref = bookingId ? `/account/login?next=${encodeURIComponent(bookingHref)}` : "/account";
  /* Who can start the checkout here. It needs a member session, so a fresh
     guest goes through the login first. A group payer goes to their trip page
     too: /api/portal/bookings/[id]/pay measures what is owed from the payer's
     OWN agreed_price and does not add the bookings they cover, so it would
     refuse the group's securing amount as more than is owed. */
  const payDirect = member && roster.length === 0;

  async function payNow() {
    if (!bookingId || paying) return;
    setPayError(""); setPaying(true);
    try {
      const res = await fetch(`/api/portal/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: securingAmount }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json.url === "string") {
        track("register_pay_now", { package: ctx.packageId, amount: securingAmount });
        // Stripe takes it from here. The button stays busy while the browser
        // navigates, so a second press cannot open a second checkout.
        window.location.href = json.url;
        return;
      }
      setPayError(json.error || "We could not open the payment. Your account has the bank details.");
      setPaying(false);
    } catch {
      setPayError("We could not open the payment. Your account has the bank details.");
      setPaying(false);
    }
  }

  async function logoutAndRegisterAsGuest() {
    await createClient().auth.signOut().catch(() => {});
    setMember(false);
    // A shared laptop is a real way to land on the warning screen: the booking
    // belongs to whoever was signed in, not to the person now holding it.
    setConflict(null);
    setFirstName(""); setLastName(""); setEmail("");
  }

  const inputCls = "px-4 py-3.5 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]";

  /* Group booking — collapsed until asked for, because most people book alone
     and an empty roster is noise. Each person added becomes their own booking
     with their own trip page; only the money stays here, with the payer.

     Written once as an ELEMENT (not a nested component, which React would
     remount on every keystroke) and rendered by BOTH the guest form and the
     member confirm card, so the two can never drift. Returning guests are the
     likeliest to bring a friend, so the member branch gets the same offer. */
  const groupBlock = canAddPeople ? (
    <div className="mb-5">
      {companions.length === 0 ? (
        <button type="button" onClick={addCompanion}
          className="text-[13px] font-bold text-[#00afdb] hover:underline">
          + Booking for more than one person?
        </button>
      ) : (
        <div className="rounded-2xl border border-[#e8f1f4] bg-[#f7fbfc] p-3.5">
          <p className="text-[12.5px] font-bold text-[#00374a] mb-2.5">Who else is coming?</p>
          {companions.map((c, i) => (
            <div key={i} className="mb-3 pb-3 border-b border-[#e8f1f4] last:border-0 last:mb-0 last:pb-0">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input value={c.firstName} onChange={(e) => setCompanionField(i, "firstName", e.target.value)} placeholder="First name" className={inputCls} />
                <input value={c.lastName} onChange={(e) => setCompanionField(i, "lastName", e.target.value)} placeholder="Last name" className={inputCls} />
              </div>
              <input type="email" value={c.email} onChange={(e) => setCompanionField(i, "email", e.target.value)} placeholder="Their email · for their own trip page" className={`w-full mb-2 ${inputCls}`} />
              <PackageChoice
                value={c.packageId}
                onChange={(id) => setCompanionField(i, "packageId", id)}
                options={weekPackages}
                money={money}
                caption={`${c.firstName.trim() || `Person ${i + 2}`}'s package`}
                action={
                  <button type="button" onClick={() => removeCompanion(i)}
                    aria-label={`Remove ${c.firstName.trim() || `person ${i + 2}`}`}
                    className="shrink-0 text-[12px] font-semibold text-[#9aa6ac] hover:text-red-500">Remove</button>
                }
              />
              {/* Their own gear, on their own package. A friend who brings
                  their own board was being charged for a rental the payer
                  could decline for themselves. Shown only where the package
                  actually offers a choice, which beginner packages never do. */}
              {gearMap[c.packageId] && (
                <div className="mt-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac] mb-1 truncate">
                    {c.firstName.trim() || `Person ${i + 2}`}&apos;s gear
                  </p>
                  <GearPills
                    tone="quiet"
                    options={gearMap[c.packageId]!}
                    value={c.gear ?? gearMap[c.packageId]!.baseline}
                    rentalId={c.rentalId ?? null}
                    onChange={(gear, rentalId) => setCompanionGear(i, gear, rentalId)}
                    fmt={money}
                  />
                </div>
              )}
              {/* On their row, beside the Remove button that fixes it. The
                  generic red line at the bottom of the form would say this
                  about "the booking" when it is about one person in it. */}
              {!!companionBlocked && companionBlocked.email === c.email.trim().toLowerCase() && (
                <p className="mt-2.5 rounded-xl border border-[#f3ddb5] bg-[#fdf3e3] px-3 py-2 text-[12px] text-[#8a5a12] leading-snug">
                  {companionBlocked.message}{" "}
                  {/* The message used to end in "email us" with nothing to
                      click. Same mailto the warm screen offers, already
                      carrying which trip it is about. */}
                  <a href={supportMailto({ tripLabel, firstName: firstName || "there", topic: "add-someone" })}
                    className="font-bold text-[#8a5a12] underline">
                    Email us to move their spot onto your plan
                  </a>
                </p>
              )}
            </div>
          ))}
          {companions.length < 6 && (
            <button type="button" onClick={addCompanion} className="text-[12.5px] font-bold text-[#00afdb] hover:underline">+ Add another person</button>
          )}
          <div className="mt-3 pt-3 border-t border-[#e8f1f4]">
            {/* The payer's own row names their gear too, so the group reads as
                one comparable list. No control here: they already chose it in
                the picker, and a second one would be two places to change it. */}
            <div className="flex justify-between gap-3 text-[13px] mb-0.5">
              <span className="text-[#5a6b72] min-w-0">You · {ctx.accommodation}
                {gearMap[ctx.packageId] && (
                  <span className="block text-[11px] text-[#9aa6ac]">{GEAR_LABELS[ctx.gear ?? "rental"]}</span>
                )}
              </span>
              <span className="font-bold text-[#00374a] tabular-nums shrink-0">{money(ctx.price)}</span>
            </div>
            {companions.map((c, i) => !hasContent(c) ? null : (
              <div key={i} className="flex justify-between gap-3 text-[13px] mb-0.5">
                <span className="text-[#5a6b72] min-w-0">{c.firstName.trim() || `Person ${i + 2}`}
                  {gearMap[c.packageId] && (
                    <span className="block text-[11px] text-[#9aa6ac]">{GEAR_LABELS[c.gear ?? gearMap[c.packageId]!.baseline]}</span>
                  )}
                </span>
                <span className="font-bold text-[#00374a] tabular-nums shrink-0">{money(priceOf(c))}</span>
              </div>
            ))}
            <div className="flex justify-between text-[14px] pt-1.5 mt-1 border-t border-[#e8f1f4]">
              <span className="font-bold text-[#00374a]">Total for {roster.length + 1} spots</span>
              <span className="font-extrabold text-[#00374a] tabular-nums">{money(groupTotal)}</span>
            </div>
            <p className="text-[11.5px] text-[#8a9aa0] leading-snug mt-2">
              One payment plan, one invoice, all of it to you. Everyone else gets their own trip page with nothing to pay.
            </p>
          </div>
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
            <input type="checkbox" checked={groupConsent} onChange={(e) => setGroupConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
            <span className="text-[12px] text-[#5a6b72] leading-snug">I have their okay to give NP7 their details, and I&apos;ll let them know we&apos;ll be in touch.</span>
          </label>
          {/* Said out loud rather than enforced in silence: an unfinished row
              used to be dropped from the submission without a word, and the
              payer left thinking that friend had a spot. */}
          {rosterIncomplete && (
            <p className="mt-2 text-[11.5px] text-[#8a5a12] leading-snug">
              Everyone here needs a first name and their own email, that&apos;s how they get their trip page. Remove a row you don&apos;t need.
            </p>
          )}
        </div>
      )}
    </div>
  ) : null;

  // Both branches submit the same group, so they share the same gate and the
  // same group label. Only the solo wording differs.
  const blocked = submitting || (roster.length > 0 && !groupConsent) || rosterIncomplete;
  const groupLabel = roster.length > 0 ? `Register ${roster.length + 1} spots, free` : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Register for the clinic">
      <button className="absolute inset-0 bg-[#00141d]/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-[460px] bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_30px_80px_rgba(0,20,30,0.4)] max-h-[92svh] overflow-y-auto">
        {conflict ? (
          <div>
            <AlreadyBooked
              kind={conflict.kind}
              tripLabel={conflict.tripLabel}
              bookingId={conflict.bookingId}
              payerName={conflict.payerName}
              email={email}
              firstName={firstName}
              onClose={onClose}
            />
            {/* An escape for everybody, not only members.
                A guest who typed two friends in full had the whole modal body
                replaced by this screen, with "Done" (which unmounts it, losing
                the roster) as the only way out. The roster survives here
                because the form is hidden, not unmounted: clearing the conflict
                brings it back exactly as it was. */}
            <div className="px-8 pb-7 -mt-3">
              {member ? (
                <button onClick={logoutAndRegisterAsGuest}
                  className="w-full text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a] transition-colors">
                  Not you? Log out &amp; register as someone else
                </button>
              ) : (
                <button onClick={() => { setConflict(null); setEmail(""); }}
                  className="w-full text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a] transition-colors">
                  Not you? Use a different email
                </button>
              )}
            </div>
          </div>
        ) : registered ? (
          <div className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-5">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            {/* Counted from what the server created, never from the roster on
                screen. createCompanionBookings skips a companion it could not
                write (one friend must not cost the others their spot), so a
                heading read off local state can announce spots nobody holds. */}
            <h3 className="text-2xl font-black tracking-[-0.02em] text-[#00374a] mb-2">{created.length > 0 ? `${created.length + 1} spots held! 🤙` : "You're registered! 🤙"}</h3>
            {created.length > 0 && (
              <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mb-3">
                {created.map((c) => c.firstName.trim()).filter(Boolean).join(", ")} {created.length === 1 ? "gets" : "get"} their own trip page by email, with nothing to pay. The whole group is on <strong>your</strong> payment plan.
              </p>
            )}
            {/* The honest line when the two disagree: they asked for more spots
                than came back, and the team can still fix it by hand. */}
            {created.length < roster.length && (
              <p className="text-[12.5px] text-[#8a5a12] leading-snug mb-3">
                We could not add {roster.length - created.length === 1 ? "one of them" : `${roster.length - created.length} of them`} to your booking.{" "}
                <a href={supportMailto({ tripLabel, firstName, topic: "add-someone" })} className="font-bold underline">Email us</a> and we&apos;ll put them on it.
              </p>
            )}
            <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6">
              {securingAmount > 0
                ? <>We&apos;ve emailed you how it works. <strong>Secure {spotsWord}</strong> now, fully refundable for {refundDays} days.</>
                : <>We&apos;ve emailed you how it works. When you&apos;re ready, <strong>secure your spot</strong> with the refundable downpayment in your account, no rush, you&apos;ve got time.</>}
            </p>

            {/* The moment somebody is most willing to pay is right now, so the
                securing payment is the loud button and the account link goes
                quiet behind it. Only a logged-in payer can start the checkout
                (the route needs their session); a fresh guest is sent through
                the login their welcome mail already unlocks. */}
            {securingAmount > 0 && bookingId && (
              payDirect ? (
                <button type="button" onClick={payNow} disabled={paying}
                  className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
                  {paying ? "Opening…" : `Pay ${fmt(securingAmount)} now`}
                </button>
              ) : (
                <a href={member ? bookingHref : loginHref}
                  className="block w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] transition-all">
                  Pay {fmt(securingAmount)} now
                </a>
              )
            )}
            {payError && <p className="mt-3 text-[13px] text-red-500 leading-snug">{payError}</p>}
            {securingAmount > 0 && bookingId && !member && !payError && (
              <p className="mt-2.5 text-[12px] text-[#9aa6ac] leading-snug">Log in first, your welcome mail has the link.</p>
            )}

            <a
              href={bookingId ? (member ? bookingHref : loginHref) : "/account"}
              className={securingAmount > 0 && bookingId
                ? "block w-full mt-3 text-[12.5px] font-bold text-[#7a8a90] hover:text-[#00374a]"
                : "inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]"}
            >
              {bookingId && member ? "Go to my trip" : securingAmount > 0 && bookingId ? "Later, in my account" : "Open my account"}
            </a>
            <button onClick={onClose} className="block w-full mt-3 text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a]">Done</button>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-black tracking-[-0.02em] text-[#00374a]">Register for the clinic</h3>
                <p className="text-[13px] text-[#6a7a80] mt-1">
                  {ctx.experienceTitle}
                  {ctx.editionLabel ? ` · ${ctx.editionLabel}` : ""}
                  {ctx.editionDates ? ` · ${ctx.editionDates}` : ""}
                </p>
                {/* Honest levers — the REAL numbers, only when they genuinely help:
                    almost-gone (≤3 left) and a healthy crew already in (≥4 going). */}
                <div className="flex flex-wrap gap-1.5 mt-2 empty:hidden">
                  {typeof ctx.spotsLeft === "number" && ctx.spotsLeft > 0 && ctx.spotsLeft <= 3 && (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#c4621a] bg-[#fdebd0] px-2.5 py-1 rounded-full">
                      🌊 Only {ctx.spotsLeft} spot{ctx.spotsLeft === 1 ? "" : "s"} left this week
                    </span>
                  )}
                  {typeof ctx.going === "number" && ctx.going >= 4 && (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#0f6e56] bg-[#e6f5ee] px-2.5 py-1 rounded-full">
                      🤙 Join {ctx.going} riders already in this week
                    </span>
                  )}
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-[#f1f5f6] text-[#5a6b72] hover:bg-[#e4ebee]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Hero: FREE is the loud element at the low-friction signup moment. */}
            <div className="rounded-2xl bg-[#00afdb]/[0.07] border border-[#cdeefa] px-5 py-4 mb-3 text-center">
              <p className="text-[27px] font-black tracking-[-0.02em] text-[#00afdb] leading-none">Free today</p>
              {/* The second line follows the roster: quoting the payer's own
                  seat under a total for two reads as two prices for one thing. */}
              <p className="text-[13px] text-[#5a6b72] mt-1.5">No card needed. Pay <strong className="text-[#00374a]">{fmt(0)}</strong> to register.<br />
                {roster.length > 0
                  ? <>{roster.length + 1} spots, from <strong className="text-[#00374a]">{money(groupTotal)}</strong> paid later.</>
                  : <>{ctx.level} · {ctx.accommodation}, from <strong className="text-[#00374a]">{fmt(ctx.price)}</strong> paid later.</>}
              </p>
            </div>

            {/* Full payment plan — transparent, but on demand (they already saw the
                price when choosing their package) so the numbers don't dominate. */}
            <details className="group mb-6 rounded-2xl bg-[#f7fbfc] border border-[#e6eef0] overflow-hidden">
              <summary className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer list-none select-none text-[13px] font-bold text-[#5a6b72] hover:text-[#00374a]">
                See the full payment plan{roster.length > 0 ? ` for all ${roster.length + 1}` : ""}
                <svg className="w-4 h-4 text-[#9aa6ac] transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              {/* Dimmed while the group changed and the new plan is still in
                  flight, so the old numbers can never pass for the new ones. */}
              <div className={`px-5 pb-4 ${planStale ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-3 text-[13.5px] pt-1">
                  <span className="font-bold text-[#00374a]">
                    {planPeople > 1 ? `All ${planPeople} spots` : `${ctx.level} · ${ctx.accommodation}`}
                    {planPeople > 1 && <span className="block text-[11.5px] font-semibold text-[#9aa6ac] mt-0.5">You and {planPeople - 1} more, on one plan</span>}
                  </span>
                  <span className="font-bold text-[#00374a] shrink-0">{planPeople > 1 && quote ? fmt(quote.price) : fmt(ctx.price)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-[#e6eef0] text-[13.5px]">
                  <span className="text-[#5a6b72]">Due today to register</span>
                  <span className="font-black text-[#00afdb] shrink-0">Free</span>
                </div>
                {quote && quote.milestones.map((m) => (
                  <div key={m.kind} className="flex items-start justify-between gap-3 mt-2 pt-2 border-t border-[#e6eef0] text-[13.5px]">
                    <span className="text-[#5a6b72]">
                      {m.kind === "deposit" ? `Deposit · secures ${spotsWord}` : m.kind === "downpayment" ? `Downpayment (${quote.downpaymentPercent}% of ${planPeople > 1 ? "the group" : "your trip"})` : "Final balance"}
                      <span className="block text-[11.5px] text-[#9aa6ac] mt-0.5">{m.dueLabel}</span>
                    </span>
                    <span className="font-bold text-[#00374a] shrink-0">{fmt(m.amount)}</span>
                  </div>
                ))}
              </div>
            </details>

            {/* what happens next */}
            <div className="mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9aa6ac] mb-2.5">How it works</p>
              <ol className="space-y-2">
                {[
                  "Register free today. No payment, no commitment.",
                  "We email you how it works & set up your account.",
                  // The securing step, with THIS package's real numbers (deposit if
                  // one is set; otherwise the catch-up downpayment) — generic if
                  // the quote hasn't loaded.
                  quote
                    ? quote.deposit > 0
                      ? `Secure ${spotsWord} with the refundable ${fmt(quote.deposit)} deposit · ${quote.refundDays} days to change your mind.${quote.milestones.some((m) => m.kind === "downpayment") ? ` Your ${quote.downpaymentPercent}% downpayment tops it up within ${quote.refundDays} days of signing up.` : ""}`
                      : `Secure ${spotsWord} with the ${quote.downpaymentPercent}% downpayment${quote.milestones[0] ? ` (${fmt(quote.milestones[0].amount)})` : ""}, due within ${quote.refundDays} days, so you've got time to sort flights first.`
                    : "Secure your spot with the refundable downpayment, no rush, you've got time.",
                  "Plan it in your account: flights, extra nights & your team.",
                  "Pay the balance later, then show up & ride.",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#5a6b72] leading-snug">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#00afdb]/12 text-[#0782a0] grid place-items-center text-[11px] font-bold">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </div>

            {!ready ? (
              <div className="py-8 text-center text-[13px] text-[#9aa6ac]">One sec…</div>
            ) : member ? (
              <>
                <div className="rounded-2xl border border-[#cdeefa] bg-[#00afdb]/8 px-5 py-4 mb-5">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#0782a0] mb-1">Registering as</p>
                  <p className="text-[15px] font-bold text-[#00374a]">{firstName} {lastName}</p>
                  <p className="text-[13px] text-[#5a6b72] mt-0.5 break-all">{email}</p>
                </div>
                {groupBlock}
                {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}
                <button onClick={go} disabled={blocked}
                  className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
                  {submitting ? "One sec…" : groupLabel ?? "Register me, free"}
                </button>
                <p className="mt-3 text-center text-[12px] text-[#9aa6ac] leading-snug">{reassurance}</p>
                <button onClick={logoutAndRegisterAsGuest} disabled={submitting}
                  className="w-full mt-3 text-[12.5px] font-semibold text-[#7a8a90] hover:text-[#00374a] transition-colors disabled:opacity-60">
                  Not you? Log out &amp; register as someone else
                </button>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); go(); }}>
                {/* Honeypot: off-screen, unfocusable, hidden from screen
                    readers, and named so no password manager autofills it.
                    Anything in here came from a script that filled every
                    input it found. */}
                <input
                  type="text" name="np7_hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
                  value={trap} onChange={(e) => setTrap(e.target.value)}
                  style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                />
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" className={inputCls} />
                  <input required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" className={inputCls} />
                </div>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className={`w-full mb-4 ${inputCls}`} />

                {groupBlock}

                <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
                  <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
                  <span className="text-[12.5px] text-[#5a6b72] leading-snug">Keep me posted on trips, tips &amp; the odd offer. <span className="text-[#9aa6ac]">(optional: you&apos;ll still get everything about your booking)</span></span>
                </label>

                {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

                <button type="submit" disabled={blocked}
                  className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] shadow-[0_6px_24px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
                  {submitting ? "One sec…" : groupLabel ?? "Register free"}
                </button>
                <p className="mt-3 text-center text-[12px] text-[#9aa6ac] leading-snug">{reassurance}</p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
