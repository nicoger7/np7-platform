import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily: gift-voucher expiry.
 *
 * Two jobs, same sweep:
 *  1. Warn — an `active` voucher whose redeem_by is within 30 days gets a
 *     reminder to the recipient (falling back to the buyer when no recipient
 *     e-mail was captured). Two buckets, ~30 and ~7 days out; the dedupe key
 *     carries the bucket, so each voucher hears exactly twice, ever. A €5k
 *     voucher must never die silently.
 *  2. Expire — `active` rows whose redeem_by has passed flip to `expired`.
 *     Only `active`: a `pending` voucher was never paid, and everything else
 *     is already terminal. No "your voucher died" mail — the warnings were
 *     the kindness, the flip is bookkeeping.
 *
 * Vouchers without a redeem_by never expire and are left alone.
 */

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Flip past-due vouchers.
  const { data: dead } = await db
    .from("gift_vouchers").select("id")
    .eq("status", "active").not("redeem_by", "is", null).lt("redeem_by", today);
  let expired = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deadIds = ((dead ?? []) as any[]).map((d) => d.id);
  if (deadIds.length) {
    const { error } = await db.from("gift_vouchers").update({ status: "expired" }).in("id", deadIds);
    if (!error) expired = deadIds.length;
  }

  // 2. Warn about the ones on the clock.
  const horizon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: soon } = await db
    .from("gift_vouchers")
    .select("id, code, amount, currency, redeem_by, recipient_name, recipient_email, buyer_contact_id")
    .eq("status", "active").not("redeem_by", "is", null)
    .gte("redeem_by", today).lte("redeem_by", horizon);

  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";
  let reminded = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of (soon ?? []) as any[]) {
    let email: string | null = String(v.recipient_email ?? "").trim() || null;
    let firstName: string | undefined = String(v.recipient_name ?? "").split(" ")[0] || undefined;
    let contactId: string | undefined;
    if (!email && v.buyer_contact_id) {
      const { data: c } = await db.from("contacts").select("id,name,email").eq("id", v.buyer_contact_id).maybeSingle();
      if (c?.email) {
        email = c.email;
        firstName = String(c.name ?? "").split(" ")[0] || undefined;
        contactId = c.id;
      }
    }
    if (!email) continue;

    const daysLeft = Math.round(
      (new Date(`${v.redeem_by}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000,
    );
    const bucket = daysLeft <= 7 ? "7" : "30";
    const amountLabel = new Intl.NumberFormat("de-DE", {
      style: "currency", currency: v.currency || "EUR", maximumFractionDigits: 0,
    }).format(Number(v.amount) || 0);
    const redeemByLabel = new Date(`${v.redeem_by}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });

    const res = await sendEmail({
      to: email,
      templateKey: "voucher_expiry_reminder",
      vars: { firstName, code: v.code, amountLabel, redeemByLabel, browseLink: `${site}/experience` },
      contactId,
      dedupeKey: `voucher_expiry:${v.id}:${bucket}`,
    }).catch(() => null);
    if (res) reminded++;
  }

  return NextResponse.json({ ok: true, expired, reminded, onTheClock: (soon ?? []).length });
}
