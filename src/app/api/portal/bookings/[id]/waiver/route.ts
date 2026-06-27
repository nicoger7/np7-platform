import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { WAIVER_VERSION } from "@/lib/waiver";

/**
 * POST /api/portal/bookings/[id]/waiver  { name, signature?, agree }
 * Member signs the waiver for their own booking. Stores the signature + an audit
 * trail (name, timestamp, IP, browser, waiver version). One signature per booking.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { name?: string; signature?: string | null; agree?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Please type your full name." }, { status: 400 });
  if (body.agree !== true) return NextResponse.json({ error: "Please confirm you agree." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings").select("id, contact_id").eq("id", id).maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  // NB: experience_id is intentionally omitted — it's derivable from booking_id
  // and isn't present on every applied schema version. booking_id is the key.
  const { error } = await db.from("exp_waiver_signatures").upsert({
    booking_id: id,
    contact_id: booking.contact_id,
    version: WAIVER_VERSION,
    signed_name: name,
    signature_image: typeof body.signature === "string" ? body.signature : null,
    signed_at: new Date().toISOString(),
    ip,
    user_agent: ua,
  }, { onConflict: "booking_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
