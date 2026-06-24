import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { getMemoryPhotosForBooking } from "@/lib/portal-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily lifecycle runner (Vercel cron → vercel.json). Idempotent: every send
 * uses a per-booking dedupe_key so re-runs never double-send.
 *
 * Covers the market-standard booking arc against booking state + edition dates:
 *   • payment nudges    — up to 2 (+2d, +5d), stop once the deposit is paid
 *   • balance invoice    — invoice + reminder (~45d / ~30d out), stop once paid
 *   • balance paid        — one confirmation
 *   • pre-trip            — planning (~21d) + final countdown (~3d, WhatsApp)
 *   • post-trip           — thank-you + review/photos (~3d after the week ends)
 *
 * The 96 Notion-migrated pipeline_rules remain the team-editable source of truth
 * in /admin/pipeline-rules; this runner sends the transactional sequence.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured → allow (dev); set CRON_SECRET in prod
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret;
}

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return undefined;
  const s = new Date(start), e = end ? new Date(end) : null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${d(s)} – ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = Date.now();
  const DAY = 86400000;

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

  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id,status,experience_id,edition_id,agreed_price,downpayment_received,final_payment_received,created_at,contacts(name,email),exp_experiences(title,slug),exp_editions(date_start,date_end,deposit,whatsapp_group_link)")
    .not("status", "in", "(lost)");

  // Pre-trip content (packing list + personal note) per experience — written once
  // in Event Content, pulled into the pre-trip emails. Fetched separately (and
  // tolerant of migration 051) so a missing column can never break the main run.
  const expIds = [...new Set((bookings ?? []).map((b: { experience_id?: string | null }) => b.experience_id).filter(Boolean))] as string[];
  const edIds = [...new Set((bookings ?? []).map((b: { edition_id?: string | null }) => b.edition_id).filter(Boolean))] as string[];
  const content = new Map<string, { packing_list?: string | null; pre_trip_note?: string | null }>();
  const editionNotes = new Map<string, string>();
  if (expIds.length) {
    const { data: rows } = await db.from("exp_content").select("experience_id,packing_list,pre_trip_note").in("experience_id", expIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows ?? []) as any[]) content.set(r.experience_id, { packing_list: r.packing_list, pre_trip_note: r.pre_trip_note });
  }
  if (edIds.length) {
    const { data: eds } = await db.from("exp_editions").select("id,pre_trip_note").in("id", edIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (eds ?? []) as any[]) if (e.pre_trip_note) editionNotes.set(e.id, e.pre_trip_note);
  }

  // Which bookings already have a signed waiver (so we only remind the rest).
  const bookingIds = (bookings ?? []).map((b: { id: string }) => b.id);
  const signedWaivers = new Set<string>();
  if (bookingIds.length) {
    const { data: sigs } = await db.from("exp_waiver_signatures").select("booking_id").in("booking_id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (sigs ?? []) as any[]) if (s.booking_id) signedWaivers.add(s.booking_id);
  }

  const out = {
    evaluated: (bookings ?? []).length,
    nudge: 0, balance: 0, balance_paid: 0, pretrip: 0, excitement: 0, pretrip_final: 0, post_trip: 0, waiver: 0, photos: 0,
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
    const deposit = b.exp_editions?.deposit ?? 300;
    const balanceNum = b.agreed_price != null ? b.agreed_price - deposit : null;
    const status = (b.status ?? "").toLowerCase();
    // Awaiting their first payment (down-payment OR deposit) — includes free-signup
    // LEADS (the new funnel) so they're nudged to secure their spot, not just the
    // older deposit-first "reserved" rows. Tolerant of legacy statuses.
    const awaitingDeposit = ["lead", "reserved", "payment_pending"].includes(status);
    const depositPaid = b.downpayment_received || ["confirmed", "downpayment_paid", "paid", "attended"].includes(status);
    const balancePaid = !!b.final_payment_received || ["paid", "attended"].includes(status);

    // Cutoff: trip-relative mails need the trip on/after go-live; lead nudges
    // need the reservation on/after go-live. Skip everything else (no backwards).
    const tripLive = onOrAfterCutoff(start);
    const leadLive = onOrAfterCutoff(b.created_at);

    const c = content.get(b.experience_id ?? "") ?? {};
    const vars = {
      firstName, experienceTitle: b.exp_experiences?.title,
      deposit: String(deposit),
      balance: balanceNum != null ? `€${balanceNum.toLocaleString("en-US")}` : undefined,
      dates: fmtRange(start, end),
      whatsappLink: b.exp_editions?.whatsapp_group_link ?? undefined,
      reviewLink: `${origin}/account/bookings/${b.id}/review`,
      bookingLink: `${origin}/account`,
      waiverLink: `${origin}/account/bookings/${b.id}/waiver`,
      tripLink: `${origin}/account/bookings/${b.id}`,
      // pre-trip content: edition note overrides the experience note; packing list is per-experience
      preTripNote: (editionNotes.get(b.edition_id ?? "") || c.pre_trip_note || "") || undefined,
      packingList: (c.packing_list || "") || undefined,
    };
    const send = (templateKey: string, dedupeKey: string) =>
      sendEmail({ to: email, templateKey, vars, bookingId: b.id, dedupeKey });

    // 1 · deposit still pending — up to two gentle nudges (+2d, +5d), stop once paid
    if (leadLive && !depositPaid && awaitingDeposit && (daysToStart == null || daysToStart > 3)) {
      if (ageDays >= 2) bump("nudge", await send("payment_pending_nudge", `payment_pending_nudge:d2:${b.id}`));
      if (ageDays >= 5) bump("nudge", await send("payment_pending_nudge", `payment_pending_nudge:d5:${b.id}`));
    }

    // 2 · balance — invoice + reminder, stop once paid (proxied by days-to-start since
    //     there's no per-booking "invoice sent" timestamp; the team triggers it in time)
    if (tripLive && depositPaid && !balancePaid && balanceNum && balanceNum > 0 && daysToStart != null) {
      if (daysToStart <= 45 && daysToStart > 30) bump("balance", await send("balance_invoice_reminder", `balance_invoice_reminder:r1:${b.id}`));
      if (daysToStart <= 30 && daysToStart > 14) bump("balance", await send("balance_invoice_reminder", `balance_invoice_reminder:r2:${b.id}`));
    }

    // 3 · balance paid in full — one confirmation
    if (tripLive && depositPaid && balancePaid && balanceNum && balanceNum > 0) {
      bump("balance_paid", await send("balance_paid_confirmation", `balance_paid_confirmation:${b.id}`));
    }

    // 4 · pre-trip — planning + packing (~21d), an excitement beat (~10d), final
    //     countdown (~3d). Paid guests only.
    if (tripLive && depositPaid && daysToStart != null) {
      if (daysToStart <= 21 && daysToStart > 12) bump("pretrip", await send("pre_trip_info", `pre_trip_info:${b.id}`));
      if (daysToStart <= 12 && daysToStart > 3) bump("excitement", await send("pre_trip_excitement", `pre_trip_excitement:${b.id}`));
      if (daysToStart <= 3 && daysToStart >= 0) bump("pretrip_final", await send("pre_trip_final", `pre_trip_final:${b.id}`));
    }

    // 5 · waiver reminder — paid guests who haven't signed yet, ~14d → ~2d out
    if (tripLive && depositPaid && !signedWaivers.has(b.id) && daysToStart != null && daysToStart <= 14 && daysToStart > 2) {
      bump("waiver", await send("waiver_reminder", `waiver_reminder:${b.id}`));
    }

    // 6 · post-trip thank-you + review/photos (~3d after the week ends)
    if (tripLive && depositPaid && daysSinceEnd != null && daysSinceEnd >= 3 && daysSinceEnd <= 14) {
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

  return NextResponse.json({ ok: true, ...out });
}
