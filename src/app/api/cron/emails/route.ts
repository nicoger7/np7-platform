import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily reminder runner (Vercel cron → vercel.json). Idempotent: every send
 * uses a per-booking dedupe_key so re-runs never double-send.
 *
 * Maps the core booking reminders to booking state + edition dates. The 96
 * Notion-migrated pipeline_rules remain the editable source of truth in
 * /admin/pipeline-rules; this runner covers the essential transactional ones.
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

  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id,status,agreed_price,downpayment_received,final_payment_received,created_at,contacts(name,email),exp_experiences(title),exp_editions(date_start,date_end,deposit)")
    .not("status", "in", "(lost,attended)");

  const out = { evaluated: (bookings ?? []).length, nudge: 0, balance: 0, pretrip: 0 };

  for (const b of bookings ?? []) {
    const email = b.contacts?.email;
    if (!email) continue;
    const firstName = (b.contacts?.name ?? "").split(" ")[0] || undefined;
    const start = b.exp_editions?.date_start as string | null;
    const daysToStart = start ? Math.round((new Date(start).getTime() - now) / DAY) : null;
    const ageDays = b.created_at ? Math.round((now - new Date(b.created_at).getTime()) / DAY) : 0;
    const deposit = b.exp_editions?.deposit ?? 300;
    const balance = b.agreed_price != null ? b.agreed_price - deposit : null;
    const depositPaid = b.downpayment_received || ["downpayment_paid", "paid", "confirmed"].includes((b.status ?? "").toLowerCase());

    const vars = {
      firstName, experienceTitle: b.exp_experiences?.title,
      deposit: String(deposit),
      balance: balance != null ? `€${balance.toLocaleString("en-US")}` : undefined,
      dates: fmtRange(start, b.exp_editions?.date_end),
      bookingLink: `${origin}/account`,
    };

    // 1 · deposit still pending after 2 days
    if (!depositPaid && b.status === "payment_pending" && ageDays >= 2 && (daysToStart == null || daysToStart > 3)) {
      const r = await sendEmail({ to: email, templateKey: "payment_pending_nudge", vars, bookingId: b.id, dedupeKey: `payment_pending_nudge:${b.id}` });
      if (r.status === "sent") out.nudge++;
    }
    // 2 · balance due ~6 weeks out
    if (depositPaid && !b.final_payment_received && balance && balance > 0 && daysToStart != null && daysToStart <= 45 && daysToStart > 14) {
      const r = await sendEmail({ to: email, templateKey: "balance_invoice_reminder", vars, bookingId: b.id, dedupeKey: `balance_invoice_reminder:${b.id}` });
      if (r.status === "sent") out.balance++;
    }
    // 3 · pre-trip info ~10 days out
    if (daysToStart != null && daysToStart <= 12 && daysToStart >= 3) {
      const r = await sendEmail({ to: email, templateKey: "pre_trip_info", vars, bookingId: b.id, dedupeKey: `pre_trip_info:${b.id}` });
      if (r.status === "sent") out.pretrip++;
    }
  }

  return NextResponse.json({ ok: true, ...out });
}
