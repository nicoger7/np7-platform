import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { generateVoucherCode } from "@/lib/vouchers";

// Admin routes are gated by middleware; no per-route auth check needed.

function isMissingTable(message?: string | null) {
  return !!message && /(gift_vouchers|relation|schema cache|does not exist)/i.test(message);
}

// ─── GET /api/admin/vouchers ───────────────────────────────────────────────────
// Optional query params: status, experience_id
export async function GET(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const experienceId = searchParams.get("experience_id");

  let query = db
    .from("gift_vouchers")
    .select(
      `*,
       buyer:contacts!buyer_contact_id(id, name, email),
       recipient:contacts!recipient_contact_id(id, name, email),
       exp_experiences(id, title)`
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (experienceId) query = query.eq("experience_id", experienceId);

  let { data, error } = await query;

  // Pre-migration / join issues → fall back to a plain select so the page still loads.
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ vouchers: [] });
    let fb = db.from("gift_vouchers").select("*").order("created_at", { ascending: false });
    if (status) fb = fb.eq("status", status);
    if (experienceId) fb = fb.eq("experience_id", experienceId);
    ({ data, error } = await fb);
    if (error) {
      if (isMissingTable(error.message)) return NextResponse.json({ vouchers: [] });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  // Experiences for the create/edit form's restriction dropdown — one payload,
  // so the page needs no second endpoint.
  const { data: experiences } = await db
    .from("exp_experiences").select("id, title").is("archived_at", null).order("title");

  return NextResponse.json({ vouchers: data ?? [], experiences: experiences ?? [] });
}

// ─── POST /api/admin/vouchers ──────────────────────────────────────────────────
// Admin-issued voucher (goodwill, compensation, partner gift) — unlike the shop
// flow there's no buyer and no bank transfer to wait for, so `activate: true`
// makes it immediately redeemable.
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json().catch(() => ({}));

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "A voucher needs a positive amount." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const activate = body.activate === true;
  const months = amount > 5000 && !body.experience_id ? 24 : 12; // same rule as activation
  const rb = new Date(now); rb.setMonth(rb.getMonth() + months);

  const { data, error } = await db
    .from("gift_vouchers")
    .insert({
      code: generateVoucherCode(),
      recipient_name: body.recipient_name || null,
      recipient_email: body.recipient_email || null,
      recipient_contact_id: body.recipient_contact_id || null,
      experience_id: body.experience_id || null,
      amount,
      currency: body.currency || "EUR",
      message: body.message || null,
      notes: body.notes || null,
      status: activate ? "active" : "pending",
      ...(activate ? { paid_at: now, issued_at: now, redeem_by: rb.toISOString().slice(0, 10) } : {}),
    })
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: "Run migration 036 first (gift_vouchers table missing)." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, voucher: data });
}
