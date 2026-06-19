import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// Member-facing add-ons for a booking. Members can request components flagged
// addon_available; the team confirms them in admin (status flips to 'confirmed').

async function ownedBooking(db: ReturnType<typeof createAdminClient>, id: string, contactId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from("exp_bookings").select("id, experience_id").eq("id", id).eq("contact_id", contactId).maybeSingle();
  return data ?? null;
}

// GET → { available: [bookable components], mine: [this booking's add-ons] }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const booking = await ownedBooking(db, id, auth.user.contactId);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const expId = booking.experience_id;
  let availQ = db.from("exp_components").select("id,name,category,description,sell_price,experience_id,is_global").eq("addon_available", true);
  if (expId) availQ = availQ.or(`experience_id.eq.${expId},experience_id.is.null,is_global.eq.true`);
  const { data: available } = await availQ;

  const { data: mine } = await db.from("exp_booking_addons").select("*, exp_components(name)").eq("booking_id", id);
  return NextResponse.json({ available: available ?? [], mine: mine ?? [] });
}

// POST { component_id } → request an add-on (status 'requested')
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const { component_id } = await request.json().catch(() => ({}));
  if (!component_id) return NextResponse.json({ error: "Missing component" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const booking = await ownedBooking(db, id, auth.user.contactId);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { data: comp } = await db.from("exp_components").select("id,name,sell_price,addon_available").eq("id", component_id).maybeSingle();
  if (!comp || !comp.addon_available) return NextResponse.json({ error: "Not available" }, { status: 400 });

  // avoid duplicate pending requests for the same component
  const { data: existing } = await db.from("exp_booking_addons").select("id,status").eq("booking_id", id).eq("component_id", component_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((existing ?? []).some((a: any) => a.status !== "declined")) {
    return NextResponse.json({ error: "Already requested" }, { status: 409 });
  }

  const full = { booking_id: id, component_id, label: comp.name, price: comp.sell_price ?? null, status: "requested", source: "member", requested_at: new Date().toISOString() };
  let { error } = await db.from("exp_booking_addons").insert(full);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    // pre-migration 024 — insert without the new columns
    ({ error } = await db.from("exp_booking_addons").insert({ booking_id: id, component_id, label: comp.name, price: comp.sell_price ?? null }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
