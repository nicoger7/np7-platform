import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { effectiveAddonStatus, noteForStatus } from "@/lib/addons";
import { guestRoom, coveredWindow, newNights, offeredToBooking } from "@/lib/stay-nights";

// Member-facing add-ons for a booking. Members can request components flagged
// addon_available; the team confirms them in admin (status flips to 'confirmed').

async function ownedBooking(db: ReturnType<typeof createAdminClient>, id: string, contactId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from("exp_bookings").select("id, experience_id, edition_id").eq("id", id).eq("contact_id", contactId).maybeSingle();
  return data ?? null;
}

// GET → { available: [bookable components], mine: [this booking's add-ons] }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi({ allowPreview: true });
  if (!auth.ok) return auth.res;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const booking = await ownedBooking(db, id, auth.user.contactId);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const expId = booking.experience_id;
  // No addon_available filter in the query any more: room nights are opt-OUT
  // and generic extras opt-IN, so the decision moved into offeredToBooking().
  let availQ = db
    .from("exp_components")
    .select("id,name,category,description,sell_price,experience_id,edition_id,is_global,payment_mode,payment_note,hotel_id,room_type,addon_available,extra_nights_blocked")
    .is("archived_at", null);
  if (expId) availQ = availQ.or(`experience_id.eq.${expId},experience_id.is.null,is_global.eq.true`);
  const { data: availableRaw } = await availQ;

  const { data: mine } = await db.from("exp_booking_addons").select("*, exp_components(name)").eq("booking_id", id);

  // Extra nights are only ever the guest's OWN room — anything else quotes a
  // bed they cannot sleep in, at a price that is not theirs.
  const room = await guestRoom(db, id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const available = ((availableRaw ?? []) as any[]).filter((c) =>
    offeredToBooking(c, { editionId: booking.edition_id ?? null, room }),
  );

  // What the guest already sleeps through, so the date picker can start after
  // it instead of re-offering nights they hold.
  const { data: bk } = await db.from("exp_bookings").select("exp_editions(date_start, date_end)").eq("id", id).maybeSingle();
  const covered = coveredWindow(bk?.exp_editions?.date_start ?? null, bk?.exp_editions?.date_end ?? null, mine ?? [], room);

  return NextResponse.json({ available, mine: mine ?? [], covered });
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

  const { data: comp } = await db
    .from("exp_components")
    .select("id,name,category,sell_price,addon_available,extra_nights_blocked,payment_mode,payment_note,hotel_id,room_type,edition_id,archived_at")
    .eq("id", component_id)
    .maybeSingle();
  if (!comp || comp.archived_at) return NextResponse.json({ error: "Not available" }, { status: 400 });

  // The till applies exactly the rule the menu applied — edition scope, the
  // guest's own room, opt-out for nights and opt-in for everything else. A list
  // is a UI; this is where money is agreed.
  const room = await guestRoom(db, id);
  if (!offeredToBooking(comp, { editionId: booking.edition_id ?? null, room })) {
    return NextResponse.json({ error: "That extra isn't available on your booking." }, { status: 400 });
  }

  const { data: existing } = await db.from("exp_booking_addons").select("id,status,notes,meta").eq("booking_id", id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveAddons = ((existing ?? []) as any[]).filter((a) => effectiveAddonStatus(a) !== "declined");

  // Time-based extras (accommodation → nights, gear rental → days) are priced
  // from the dates. Units are counted against what the guest ALREADY has — the
  // trip week plus every night already requested or confirmed — so extending a
  // stay charges the new nights only. Server-authoritative throughout.
  const PERIOD_UNIT: Record<string, string> = { accommodation: "night", gear: "day" };
  let label = comp.name;
  let price: number | null = comp.sell_price ?? null;
  let meta: Record<string, unknown> = {};
  let quantity = 1;
  const unit = comp.category ? PERIOD_UNIT[comp.category] : undefined;
  const timeBased = Boolean(unit && (body.checkIn || body.checkOut));

  if (timeBased) {
    const { data: bk } = await db.from("exp_bookings").select("exp_editions(date_start, date_end)").eq("id", id).maybeSingle();
    const checkIn: string | null = typeof body.checkIn === "string" ? body.checkIn : null;
    const checkOut: string | null = typeof body.checkOut === "string" ? body.checkOut : null;
    const covered = coveredWindow(bk?.exp_editions?.date_start ?? null, bk?.exp_editions?.date_end ?? null, liveAddons, room);
    const { before, after, total } = newNights(covered, checkIn, checkOut);

    if (total === 0) {
      return NextResponse.json(
        { error: "You're already staying those nights — pick dates outside your current stay." },
        { status: 409 },
      );
    }
    meta = { checkIn, checkOut, nightsBefore: before, nightsAfter: after, nights: total, unit };
    quantity = total;
    // The label stays the clean component name: quantity carries the count, so
    // the invoice line renders "… × 3 (€177.00 each)" on its own.
    if (comp.sell_price != null) price = Math.round(Number(comp.sell_price) * total * 100) / 100;
  } else {
    // Non-dated extras keep the one-per-component rule: a second identical
    // transfer or lesson is a mistake, not an extension.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (liveAddons.some((a: any) => a.component_id === component_id)) {
      return NextResponse.json({ error: "Already requested" }, { status: 409 });
    }
  }

  const note = noteForStatus("requested");
  // Stamp HOW it gets paid onto the booking row, alongside price — the terms the
  // guest agreed to must not change later because someone edited the component.
  const payMode = comp.payment_mode === "direct" ? "direct" : "np7";
  const error = await insertAddon(
    db,
    { booking_id: id, component_id, label, price, quantity, unit_price: comp.sell_price ?? null, status: "requested", source: "member", requested_at: new Date().toISOString(), notes: note, meta, payment_mode: payMode, payment_note: comp.payment_note ?? null },
    { booking_id: id, component_id, label, price, notes: note },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
