import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

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

  return NextResponse.json({ vouchers: data ?? [] });
}
