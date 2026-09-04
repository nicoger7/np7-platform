import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { publicOrigin } from "@/lib/public-origin";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { nextStepsVars } from "@/lib/email/next-steps";
import { getMemoryPhotosForBooking } from "@/lib/portal-data";
import { computePaymentPlan, dueUrgency, balanceDue } from "@/lib/payments";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";
import { mailContentReady, getSendTiming } from "@/lib/email/readiness";
import { recordHold } from "@/lib/email/holds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily lifecycle runner (Vercel cron → vercel.json). Idempotent: every send
 * uses a per-booking dedupe_key so re-runs never double-send.
 *
 * Covers the market-standard booking arc against booking state + edition dates.
 * Payment timing is driven by the SAME engine as the member plan + invoices
 * (computePaymentPlan/dueUrgency), so mails always match what the account shows:
 *   • payment nudges    — up to 2 (+2d, +5d), stop once secured
 *   • deadline ladder    — "last chance" a few days before the downpayment
 *                          deadline, "spot released" once it has passed
 *   • balance invoice    — reminder the week it falls due (start − N days),
 *                          plus one overdue nudge; stop once paid
 *   • balance paid        — one confirmation
 *   • pre-trip            — crew chat → planning → excitement → final countdown
 *   • post-trip           — thank-you + review/photos once everyone is home
 *
 * The dated ones fire on the schedule in /admin/emails (getSendTiming), which is
 * editable — this file never hard-codes a lead or a window boundary.
 *
 * The 96 Notion-migrated pipeline_rules remain the team-editable source of truth
 * in /admin/pipeline-rules; this runner sends the transactional sequence.
 */

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return undefined;
  const s = new Date(start), e = end ? new Date(end) : null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${d(s)} – ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // NEVER the request host. Vercel invokes a cron at the DEPLOYMENT's own
  // URL (np7-platform-<hash>-<team>.vercel.app), not the custom domain — so
  // deriving links from the request sent 19 guests 44 emails whose every link
  // led to a Vercel SSO wall they cannot pass. Guest-facing links are always
  // the public site; every other mail path in the codebase already does this.
  const origin = publicOrigin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = Date.now();
  const DAY = 86400000;

  // When the dated mails go out — built-in defaults plus whatever the admin set
  // (migration 138), with the windows DERIVED from those leads. The windows
  // used to be written out here as a chain (60→21→12→3), which meant every
  // lead change needed a matching edit to its neighbour's boundary; miss it and
  // a stretch of days fires nothing, with nobody any the wiser.
  const timing = await getSendTiming();
  /** Due on the lead day, still allowed until the next mail in the chain takes over. */
  const dueBefore = (key: string, daysToStart: number | null) => {
    const lead = timing.before[key], close = timing.windowClose[key];
    return daysToStart != null && lead != null && close != null && daysToStart <= lead && daysToStart > close;
  };
  /** The same, counting forward from the last day of the trip. */
  const dueAfterEnd = (key: string, daysSinceEnd: number | null) => {
    const lead = timing.afterEnd[key], close = timing.windowCloseAfterEnd[key];
    return daysSinceEnd != null && lead != null && close != null && daysSinceEnd >= lead && daysSinceEnd <= close;
  };

  // ── Edition tile snapshot ───────────────────────────────────────────────────
  // Freeze a past edition's hero so its tile (member "My trips") stays put even if
  // the experience hero is later swapped for new marketing. Only editions whose
  // trip has ENDED and that still inherit (no own hero) get the current experience
  // hero copied in. Idempotent — once set, it's skipped. Best-effort.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: doneEds } = await db.from("exp_editions").select("id,experience_id,hero_image,date_end").lt("date_end", today);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toFreeze = ((doneEds ?? []) as any[]).filter((e) => !e.hero_image && e.experience_id);
    if (toFreeze.length) {
      const expIds = [...new Set(toFreeze.map((e) => e.experience_id))];
      const { data: exps } = await db.from("exp_experiences").select("id,hero_image").in("id", expIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heroBy = new Map(((exps ?? []) as any[]).map((e) => [e.id, e.hero_image]));
      for (const e of toFreeze) {
        const hero = heroBy.get(e.experience_id);
        if (hero) await db.from("exp_editions").update({ hero_image: hero }).eq("id", e.id);
      }
    }
  } catch { /* hero column / table not ready — skip */ }

  // Go-live cutoff: never email "backwards". Set EMAIL_PIPELINE_LIVE_FROM (ISO
  // date) when Resend is connected — bookings whose trip (or, for lead nudges,
  // whose reservation) predates it are skipped entirely, so turning the engine
  // on never blasts historical guests. Unset → no suppression (dev/testing).
  const liveFromRaw = process.env.EMAIL_PIPELINE_LIVE_FROM;
  const liveFrom = liveFromRaw ? new Date(liveFromRaw).getTime() : null;
  const onOrAfterCutoff = (d?: string | null) => liveFrom == null || (!!d && new Date(d).getTime() >= liveFrom);

  /**
   * The trip being in the future is NOT enough.
   *
   * The cutoff above asks "is this trip ahead of go-live?", which every future
   * booking passes. But the condition-driven mails ask "is this true NOW?" —
   * and a balance paid in May is still paid today. Switching the pipeline on
   * therefore flushed the whole backlog: 15 guests were congratulated on
   * payments up to 79 days old, which is exactly the "never email backwards"
   * rule the trip cutoff was supposed to enforce.
   *
   * So a mail triggered by an EVENT also has to prove the event itself is
   * recent. An undateable event counts as old: we would rather stay silent
   * than congratulate someone for something we cannot place in time.
   */
  const eventLive = (d?: string | null) => liveFrom == null || (!!d && new Date(d).getTime() >= liveFrom);

  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id,covered_by_booking_id,status,experience_id,edition_id,agreed_price,deposit_received,downpayment_received,final_payment_received,created_at,contacts(name,email),exp_experiences(title,slug),exp_editions(kind,date_start,date_end,deposit,whatsapp_group_link),exp_packages(deposit,deposit_refund_days,downpayment_percent,final_days_before)")
    .not("status", "in", "(lost)");

  // Pre-trip content (packing list + personal note) per experience — written once
  // in Event Content, pulled into the pre-trip emails. Fetched separately (and
  // tolerant of migration 051) so a missing column can never break the main run.
  const expIds = [...new Set((bookings ?? []).map((b: { experience_id?: string | null }) => b.experience_id).filter(Boolean))] as string[];
  const edIds = [...new Set((bookings ?? []).map((b: { edition_id?: string | null }) => b.edition_id).filter(Boolean))] as string[];
  // Mails held back because their required content is missing — reported on the
  // run so a skip is visible instead of a silent non-send.
  const held: { template: string; bookingId: string; editionId: string | null; missing: string[] }[] = [];
  const content = new Map<string, { packing_list?: string | null; pre_trip_note?: string | null }>();
  const editionNotes = new Map<string, string>();
  const editionFinal = new Map<string, string>();
  const editionPacking = new Map<string, string>();
  if (expIds.length) {
    const { data: rows } = await db.from("exp_content").select("experience_id,packing_list,pre_trip_note").in("experience_id", expIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows ?? []) as any[]) content.set(r.experience_id, { packing_list: r.packing_list, pre_trip_note: r.pre_trip_note });
  }
  if (edIds.length) {
    // packing_list is migration 125 — select("*") so a not-yet-migrated column
    // can't break the whole run, exactly as the note handling already does.
    const { data: eds } = await db.from("exp_editions").select("*").in("id", edIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (eds ?? []) as any[]) {
      if (e.pre_trip_note) editionNotes.set(e.id, e.pre_trip_note);
      if (e.packing_list) editionPacking.set(e.id, e.packing_list);
      if (e.final_details_note) editionFinal.set(e.id, e.final_details_note);
    }
  }

  // Which bookings already have a signed waiver (so we only remind the rest).
  const bookingIds = (bookings ?? []).map((b: { id: string }) => b.id);
  // When the last payment landed, per booking — the event date behind
  // "balance paid", which the cron previously had no way to know.
  // received_at is what the admin form actually writes; `date` alone is null on
  // most recent rows, which would have made eventLive() permanently false and
  // silently killed this mail for every future balance payment. created_at is
  // the last resort — when we learned of it, if nobody dated it.
  //
  // Only money that ARRIVED counts: a pending promise or a refund is not a
  // reason to congratulate anyone. Same test the ledger uses (paymentInflow).
  //
  // The same rows also give us how much has ARRIVED, and the add-ons query below
  // gives what the trip really costs. Without both, every mail quoted a plan
  // instead of a debt: the amounts came from the hand-ticked received flags and
  // from agreed_price alone, so a guest who had overpaid one milestone, or who
  // had booked extras, was asked for a number that matched nothing on his
  // account page. Money we ask a guest for has to be the money he owes.
  const lastPaidAt = new Map<string, string>();
  const receivedBy = new Map<string, number>();
  const addonsBy = new Map<string, number>();
  if (bookingIds.length) {
    const [{ data: pays }, { data: extras }] = await Promise.all([
      db.from("exp_payments")
        .select("booking_id, amount, received_at, date, created_at, status, direction, type")
        .in("booking_id", bookingIds),
      db.from("exp_booking_addons")
        .select("booking_id, price, status, notes, payment_mode")
        .in("booking_id", bookingIds),
    ]);
    for (const id of bookingIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receivedBy.set(id, sumReceived(((pays ?? []) as any[]).filter((p) => p.booking_id === id)));
      addonsBy.set(id, ((extras ?? []) as Record<string, unknown>[])
        .filter((a) => a.booking_id === id && effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
        .reduce((n, a) => n + (Number(a.price) || 0), 0));
    }
    for (const p of (pays ?? []) as Record<string, string | null>[]) {
      if (!p.booking_id) continue;
      if (p.direction === "cost" || p.type === "refund" || p.type === "addon") continue;
      if (p.status === "pending" || p.status === "cancelled") continue;
      const when = p.received_at ?? p.date ?? p.created_at;
      if (!when) continue;
      const cur = lastPaidAt.get(p.booking_id);
      if (!cur || when > cur) lastPaidAt.set(p.booking_id, when);
    }
  }

  // Group bookings (migration 198): the payer's plan spans the whole group, a
  // covered guest is never payment-chased. Extra owed per payer = Σ covered
  // (agreed + confirmed add-ons); covered bookings keep their own price for the
  // P&L, only the money mails are pooled.
  const coveredExtraBy = new Map<string, number>();
  const isCovered = new Set<string>();
  for (const b of bookings ?? []) {
    const payer = (b as { covered_by_booking_id?: string | null }).covered_by_booking_id;
    if (!payer) continue;
    isCovered.add(b.id);
    const own = (Number(b.agreed_price) || 0) + (addonsBy.get(b.id) ?? 0);
    coveredExtraBy.set(payer, (coveredExtraBy.get(payer) ?? 0) + own);
  }

  const signedWaivers = new Set<string>();
  if (bookingIds.length) {
    const { data: sigs } = await db.from("exp_waiver_signatures").select("booking_id").in("booking_id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (sigs ?? []) as any[]) if (s.booking_id) signedWaivers.add(s.booking_id);
  }

  // Stored wind.coach training guides per booking — the post-trip thank-you
  // links to them when one exists. Only status 'stored' counts: 'review' means
  // a coach still has it open, and a guest link to a half-checked guide is
  // worse than no link. Fail OPEN to "no guide": a missing table or a failed
  // query must never break the run or hold the thank-you back — the mail
  // simply goes out as it always did, without the CTA.
  const guideBy = new Map<string, string>();
  if (bookingIds.length) {
    try {
      const { data: guides } = await db
        .from("windcoach_guides")
        .select("id, booking_id, created_at")
        .in("booking_id", bookingIds)
        .eq("status", "stored")
        .order("created_at", { ascending: true }); // newest wins the map
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const g of (guides ?? []) as any[]) if (g.booking_id && g.id) guideBy.set(g.booking_id, g.id);
    } catch { /* guides not queryable — send without the CTA */ }
  }

  const out = {
    evaluated: (bookings ?? []).length,
    nudge: 0, last_chance: 0, released: 0, balance: 0, balance_paid: 0, crew: 0, pretrip: 0, excitement: 0, pretrip_final: 0, post_trip: 0, waiver: 0, photos: 0,
  };
  const bump = (k: keyof typeof out, r: { status: string }) => { if (r.status === "sent") (out[k] as number)++; };

  for (const b of bookings ?? []) {
    const email = b.contacts?.email;
    if (!email) continue;
    const firstName = (b.contacts?.name ?? "").split(" ")[0] || undefined;
    const start = b.exp_editions?.date_start as string | null;
    const end = b.exp_editions?.date_end as string | null;
    const daysToStart = start ? Math.round((new Date(start).getTime() - now) / DAY) : null;
    const daysSinceEnd = end ? Math.round((now - new Date(end).getTime()) / DAY) : null;
    const ageDays = b.created_at ? Math.round((now - new Date(b.created_at).getTime()) / DAY) : 0;
    const status = (b.status ?? "").toLowerCase();

    // The booking's real payment plan — same engine as the member view and the
    // invoices, so every mail quotes the amounts/deadlines the account shows.
    const pkgCfg = b.exp_packages ?? {};
    const payCfg = {
      deposit: b.exp_editions?.deposit ?? pkgCfg.deposit ?? null,
      deposit_refund_days: pkgCfg.deposit_refund_days ?? null,
      downpayment_percent: pkgCfg.downpayment_percent ?? null,
      final_days_before: pkgCfg.final_days_before ?? null,
    };
    const payState = {
      // The trip total is the price PLUS confirmed add-ons — the same total the
      // invoice engine and the member's payment plan use.
      total: (b.agreed_price ?? 0) + (addonsBy.get(b.id) ?? 0) + (coveredExtraBy.get(b.id) ?? 0),
      paidAmount: receivedBy.get(b.id) ?? 0,
      editionStart: start,
      bookedAt: b.created_at ?? null,
      depositReceived: b.deposit_received ?? null,
      downpaymentReceived: b.downpayment_received ?? null,
      finalPaymentReceived: b.final_payment_received ?? null,
    };
    const plan = computePaymentPlan(payCfg, payState);
    const securing = plan.find((m) => (m.kind === "deposit" || m.kind === "downpayment") && m.status !== "paid");
    const urgency = securing ? dueUrgency(securing) : "ok";
    const finalMs = plan.find((m) => m.kind === "final");
    const balanceNum = balanceDue(payCfg, payState);
    const deposit = plan.find((m) => m.kind === "deposit")?.amount ?? 0;
    const money = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    // Awaiting their first payment (down-payment OR deposit) — includes free-signup
    // LEADS (the new funnel) so they're nudged to secure their spot, not just the
    // older deposit-first "reserved" rows. Tolerant of legacy statuses.
    const awaitingDeposit = ["lead", "reserved", "payment_pending"].includes(status) && !isCovered.has(b.id);
    const depositPaid = b.downpayment_received || ["confirmed", "downpayment_paid", "paid", "attended"].includes(status);
    /**
     * Paid, by hand and by ledger — deliberately two different questions.
     *
     * The flag said Andreas Burmeister's trip was settled while EUR 645 of
     * add-ons sat open on it, so a single boolean had to be either wrong about
     * the debt or wrong about the celebration.
     *
     * Chasing is muted when EITHER says paid, and it stays that way on purpose:
     * four live bookings are flagged paid with money still open in the ledger,
     * and one of them (a June trip, EUR 7,950, not a cent recorded) is plainly a
     * payment nobody entered rather than a guest who owes us. Auto-mailing an
     * invoice to someone who already paid is the worse error, so a human decides
     * who gets chased.
     *
     * The congratulation needs the ledger to agree: "thanks, you're paid in
     * full" to someone carrying an open balance is the same lie the portal was
     * telling.
     */
    const flaggedPaid = !!b.final_payment_received || ["paid", "attended"].includes(status);
    const ledgerSettled = balanceNum <= 0.01;
    const balancePaid = flaggedPaid || ledgerSettled;   // mutes the chase
    const balanceSettled = ledgerSettled && flaggedPaid; // earns the congratulation

    // Cutoff: trip-relative mails need the trip on/after go-live; lead nudges
    // need the reservation on/after go-live. Skip everything else (no backwards).
    const tripLive = onOrAfterCutoff(start);
    const leadLive = onOrAfterCutoff(b.created_at);
    // An edition can be a 1–2 day clinic (migration 157). The pre-trip chain is
    // written for a travelled week — crew forming two months out, packing,
    // flights, arrival, "final details" — and NONE of it exists for a clinic
    // you drive to on Friday. Without this guard the Alaçatı buyers, four days
    // out, would each receive a countdown telling them to check their packing
    // list and arrival info for a trip they never booked.
    //
    // What an event DOES get: the ticket confirmation (from the payment
    // webhook), the waiver reminder — the one legal thing that genuinely
    // applies — and the photos when they land.
    const isEvent = b.exp_editions?.kind === "event";

    const c = content.get(b.experience_id ?? "") ?? {};
    const vars = {
      firstName, experienceTitle: b.exp_experiences?.title,
      deposit: String(deposit),
      balance: balanceNum > 0 ? money(balanceNum) : undefined,
      downpayment: securing ? money(securing.amount) : undefined,
      dueDate: securing?.dueDate ? fmtDay(securing.dueDate) : undefined,
      dates: fmtRange(start, end),
      whatsappLink: b.exp_editions?.whatsapp_group_link ?? undefined,
      reviewLink: `${origin}/account/bookings/${b.id}/review`,
      // Only set when a STORED guide exists — the template renders the CTA off
      // exactly this, so no guide means the mail is unchanged from today.
      guideUrl: guideBy.has(b.id) ? `${origin}/account/guides/${guideBy.get(b.id)}` : undefined,
      bookingLink: `${origin}/account`,
      waiverLink: `${origin}/account/bookings/${b.id}/waiver`,
      tripLink: `${origin}/account/bookings/${b.id}`,
      /* The "what happens next" block: when the crew chat opens, where the
         week's outline already is, and WhatsApp for questions. Derived from the
         same schedule that sends the crew mail, so the promise and the send
         move together. */
      ...(await nextStepsVars({ experienceId: b.experience_id ?? null, editionId: b.edition_id ?? null, origin })),
      // pre-trip content: edition note overrides the experience note; packing list is per-experience
      preTripNote: (editionNotes.get(b.edition_id ?? "") || c.pre_trip_note || "") || undefined,
      finalDetailsNote: editionFinal.get(b.edition_id ?? "") || undefined,
      // edition list overrides the experience list, same rule as the note
      packingList: (editionPacking.get(b.edition_id ?? "") || c.packing_list || "") || undefined,
    };
    const send = async (templateKey: string, dedupeKey: string) => {
      // Templates degrade silently — an empty packing list just drops the
      // section — so a mail whose REQUIRED content is missing would go out
      // hollow and unlogged. Hold it instead: the dedupe key is untouched, so
      // it sends for real on a later run once the content exists.
      const ready = mailContentReady(templateKey, vars);
      if (!ready.ok) {
        held.push({ template: templateKey, bookingId: b.id, editionId: b.edition_id ?? null, missing: ready.missing });
        // Persist it: the send windows are bounded on BOTH sides, so once this
        // one closes the mail can never fire again on its own. The hold is what
        // lets you fill the content in late and still choose to send.
        await recordHold({
          templateKey, bookingId: b.id, editionId: b.edition_id ?? null,
          dedupeKey, missing: ready.missing,
        });
        return { status: "skipped" as const, error: `content missing: ${ready.missing.join(", ")}` };
      }
      return sendEmail({ to: email, templateKey, vars, bookingId: b.id, dedupeKey });
    };

    // 1 · securing payment still pending — up to two gentle nudges (+2d, +5d)
    if (leadLive && !isEvent && !depositPaid && awaitingDeposit && (daysToStart == null || daysToStart > 3)) {
      if (ageDays >= 2) bump("nudge", await send("payment_pending_nudge", `payment_pending_nudge:d2:${b.id}`));
      if (ageDays >= 5) bump("nudge", await send("payment_pending_nudge", `payment_pending_nudge:d5:${b.id}`));
    }

    // 1b · deadline ladder — the SAME dueUrgency() the member banners use:
    //      "last chance" once inside the final days before the downpayment
    //      deadline, "spot released" once it's passed. Skipped for trips that
    //      already started; a recorded payment stops the ladder automatically.
    if (leadLive && !isEvent && !depositPaid && awaitingDeposit && securing && (daysToStart == null || daysToStart > 0)) {
      if (urgency === "last_chance") bump("last_chance", await send("downpayment_last_chance", `downpayment_last_chance:${b.id}`));
      if (urgency === "expired") bump("released", await send("spot_released", `spot_released:${b.id}`));
    }

    // 2 · final balance — anchored to the plan's REAL deadline (start − N days,
    //     N per package): one reminder the week it falls due, one overdue nudge.
    const daysToFinalDue = finalMs?.dueDate ? Math.round((new Date(finalMs.dueDate).getTime() - now) / DAY) : null;
    // No event guard here on purpose. The r1 window is inherently current
    // (due within 7 days) and r2 is a debt that is STILL OWED — a deadline that
    // passed before go-live does not make the money less outstanding. tripLive
    // already stops us nagging about trips that have been and gone.
    if (tripLive && depositPaid && !balancePaid && !isCovered.has(b.id) && finalMs && finalMs.amount > 0 && daysToFinalDue != null) {
      if (daysToFinalDue <= 7 && daysToFinalDue >= 0) bump("balance", await send("balance_invoice_reminder", `balance_invoice_reminder:r1:${b.id}`));
      if (daysToFinalDue <= -3 && (daysToStart == null || daysToStart > 0)) bump("balance", await send("balance_invoice_reminder", `balance_invoice_reminder:r2:${b.id}`));
    }

    // 3 · balance paid in full — one confirmation.
    //     Not for an event: a ticket is paid in full AT checkout, so this fires
    //     immediately after the confirmation mail and promises the pre-trip
    //     chain that the guard below correctly suppresses.
    if (tripLive && !isEvent && depositPaid && balanceSettled && !isCovered.has(b.id) && (b.agreed_price ?? 0) > 0
        && eventLive(lastPaidAt.get(b.id) ?? null)) {
      bump("balance_paid", await send("balance_paid_confirmation", `balance_paid_confirmation:${b.id}`));
    }

    // 4 · pre-trip chain — crew chat, planning + packing, an excitement beat,
    //     the final countdown. Paid guests only. Each mail hands over to the
    //     next, so someone who books six weeks out never gets "two months to
    //     go": they land straight in whichever window the date falls in.
    if (tripLive && !isEvent && depositPaid && daysToStart != null) {
      if (dueBefore("crew_forming", daysToStart)) bump("crew", await send("crew_forming", `crew_forming:${b.id}`));
      if (dueBefore("pre_trip_info", daysToStart)) bump("pretrip", await send("pre_trip_info", `pre_trip_info:${b.id}`));
      if (dueBefore("pre_trip_excitement", daysToStart)) bump("excitement", await send("pre_trip_excitement", `pre_trip_excitement:${b.id}`));
      if (dueBefore("pre_trip_final", daysToStart)) bump("pretrip_final", await send("pre_trip_final", `pre_trip_final:${b.id}`));
    }

    // 5 · waiver reminder — paid guests who haven't signed yet. Runs alongside
    //     the chain above rather than inside it, and stops nagging near the trip.
    if (tripLive && depositPaid && !signedWaivers.has(b.id) && dueBefore("waiver_reminder", daysToStart)) {
      bump("waiver", await send("waiver_reminder", `waiver_reminder:${b.id}`));
    }

    // 6 · post-trip thank-you + review/photos, once everyone is home
    if (tripLive && !isEvent && depositPaid && dueAfterEnd("post_trip_thank_you", daysSinceEnd)) {
      bump("post_trip", await send("post_trip_thank_you", `post_trip_thank_you:${b.id}`));
    }

    // 7 · new photos in the gallery — once the trip has started and photos exist,
    //     a one-time "your photos are ready" (dedupe → sends only when they appear).
    const started = daysToStart != null && daysToStart <= 0;
    if (tripLive && depositPaid && started && b.edition_id && (daysSinceEnd == null || daysSinceEnd <= 60)) {
      const pics = await getMemoryPhotosForBooking(b.edition_id, b.id).catch(() => []);
      if (pics.length > 0) bump("photos", await send("photos_ready", `memories_ready:${b.id}`));
    }
  }

  return NextResponse.json({
    ok: true,
    ...out,
    heldForContent: held.length,
    held: held.slice(0, 50), // enough to act on without an unbounded payload
  });
}
