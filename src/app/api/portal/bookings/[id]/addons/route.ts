import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { effectiveAddonStatus, noteForStatus } from "@/lib/addons";

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
//      { none: true }    → mark "no add-ons needed" (a declined marker), advancing prep
async function insertAddon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  full: Record<string, unknown>,
  stripped: Record<string, unknown>,
) {
  let { error } = await db.from("exp_booking_addons").insert(full);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    ({ error } = await db.from("exp_booking_addons").insert(stripped)); // pre-migration 024
  }
  return error;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const booking = await ownedBooking(db, id, auth.user.contactId);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // "No add-ons needed" — a declined marker so the prep step can complete.
  if (body.none) {
    const { data: existing } = await db.from("exp_booking_addons").select("id,status,notes,component_id").eq("booking_id", id).is("component_id", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((existing ?? []).some((a: any) => effectiveAddonStatus(a) === "declined")) return NextResponse.json({ ok: true });
    const note = noteForStatus("declined");
    const error = await insertAddon(
      db,
      { booking_id: id, component_id: null, label: "No add-ons needed", price: 0, status: "declined", source: "member", notes: note },
      { booking_id: id, component_id: null, label: "No add-ons needed", price: 0, notes: note },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const component_id = body.component_id;
  if (!component_id) return NextResponse.json({ error: "Missing component" }, { status: 400 });

  const { data: comp } = await db.from("exp_components").select("id,name,category,sell_price,addon_available").eq("id", component_id).maybeSingle();
  if (!comp || !comp.addon_available) return NextResponse.json({ error: "Not available" }, { status: 400 });

  // avoid duplicate active requests for the same component
  const { data: existing } = await db.from("exp_booking_addons").select("id,status,notes").eq("booking_id", id).eq("component_id", component_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((existing ?? []).some((a: any) => effectiveAddonStatus(a) !== "declined")) {
    return NextResponse.json({ error: "Already requested" }, { status: 409 });
  }

  // Time-based extras (accommodation → nights, gear rental → days) need the
  // actual dates: which nights/days they want around the trip week. We compute
  // units before/after the edition and price = units × per-unit rate
  // (server-authoritative). { checkIn, checkOut }.
  const PERIOD_UNIT: Record<string, string> = { accommodation: "night", gear: "day" };
  let label = comp.name;
  let price: number | null = comp.sell_price ?? null;
  let meta: Record<string, unknown> = {};
  const unit = comp.category ? PERIOD_UNIT[comp.category] : undefined;
  if (unit && (body.checkIn || body.checkOut)) {
    const { data: bk } = await db.from("exp_bookings").select("exp_editions(date_start, date_end)").eq("id", id).maybeSingle();
    const edStart: string | null = bk?.exp_editions?.date_start ?? null;
    const edEnd: string | null = bk?.exp_editions?.date_end ?? null;
    const checkIn: string | null = typeof body.checkIn === "string" ? body.checkIn : null;
    const checkOut: string | null = typeof body.checkOut === "string" ? body.checkOut : null;
    const span = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0);
    const nightsBefore = Math.max(0, span(checkIn, edStart));
    const nightsAfter = Math.max(0, span(edEnd, checkOut));
    const total = nightsBefore + nightsAfter;
    meta = { checkIn, checkOut, nightsBefore, nightsAfter, nights: total, unit };
    if (total > 0) {
      label = `${comp.name} (${total} ${unit}${total !== 1 ? "s" : ""})`;
      if (comp.sell_price != null) price = Math.round(Number(comp.sell_price) * total * 100) / 100;
    }
  }

  const note = noteForStatus("requested");
  const error = await insertAddon(
    db,
    { booking_id: id, component_id, label, price, status: "requested", source: "member", requested_at: new Date().toISOString(), notes: note, meta },
    { booking_id: id, component_id, label, price, notes: note },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
