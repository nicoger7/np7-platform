import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// Gated by middleware (the "invites" section). Lists trip invites with the
// inviter/invitee contacts and the trip, newest first. Tolerant of migration 050.

function isMissing(message?: string | null) {
  return !!message && /(trip_invites|relation|schema cache|does not exist)/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const status = new URL(request.url).searchParams.get("status");

  let query = db
    .from("trip_invites")
    .select(
      `*,
       inviter:contacts!inviter_contact_id(id,name,email),
       invited:contacts!invited_contact_id(id,name,email),
       experience:exp_experiences!experience_id(id,title,currency),
       edition:exp_editions!edition_id(id,label,date_start)`
    )
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  let { data, error } = await query;
  if (error) {
    if (isMissing(error.message)) return NextResponse.json({ invites: [], migrationNeeded: true });
    // Join issue → plain select fallback.
    let fb = db.from("trip_invites").select("*").order("created_at", { ascending: false });
    if (status) fb = fb.eq("status", status);
    ({ data, error } = await fb);
    if (error) {
      if (isMissing(error.message)) return NextResponse.json({ invites: [], migrationNeeded: true });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  return NextResponse.json({ invites: data ?? [] });
}
