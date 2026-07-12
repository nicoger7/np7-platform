import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { noteForStatus, type AddonStatus } from "@/lib/addons";
import { resyncBookingBilling } from "@/lib/invoices/promote";

// GET /api/admin/bookings/:id/addons — list add-ons for a booking
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { data, error } = await client
    .from("exp_booking_addons")
    .select("*, exp_components(id, name, category, unit_cost)")
    .eq("booking_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/bookings/:id/addons — add an add-on to a booking
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_booking_addons")
    .insert({
      booking_id: id,
      component_id: body.component_id || null,
      label: body.label,
      price: body.price || null,
      notes: body.notes || null,
    })
    .select("*, exp_components(id, name, category, unit_cost)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/admin/bookings/:id/addons — confirm (or update) a member-requested add-on.
// On confirm it counts toward the balance and the member gets a "confirmed" email.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.addon_id) return NextResponse.json({ error: "addon_id is required" }, { status: 400 });

  const status: AddonStatus = body.status === "declined" ? "declined" : "confirmed";
  const patch: Record<string, unknown> = { status };
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  // "Confirm, no charge": include the add-on but don't bill for it (price → 0),
  // so the agreed price / balance is unchanged. Default confirm charges extra.
  if (status === "confirmed" && body.complimentary === true) patch.price = 0;

  let { data, error } = await client
    .from("exp_booking_addons").update(patch).eq("id", body.addon_id).eq("booking_id", id)
    .select("*, exp_components(name)").single();
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    // pre-migration 024 — persist the state in the notes sentinel instead
    ({ data, error } = await client.from("exp_booking_addons").update({ notes: noteForStatus(status) }).eq("id", body.addon_id).eq("booking_id", id)
      .select("*, exp_components(name)").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A confirm/decline changes the trip total → refresh the open pro-forma so the
  // amount due reflects the add-on (best-effort; never blocks the response).
  after(() => resyncBookingBilling(id).catch((e) => console.error("[addons] resync billing failed:", e)));

  // Extra nights: when the confirmed add-on carries stay dates, EXTEND the guest's
  // room week-row so the allotment slot reflects the real stay — that's what the
  // cross-edition overlap warnings watch. Extend-only: never shrinks an existing
  // range; missing sides fall back to the edition's window.
  if (status === "confirmed") {
    const meta = (data?.meta ?? {}) as { checkIn?: string | null; checkOut?: string | null };
    const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (isDate(meta.checkIn) || isDate(meta.checkOut)) {
      after(async () => {
        try {
          const { data: bk2 } = await client.from("exp_bookings").select("edition_id").eq("id", id).maybeSingle();
          let q = client.from("exp_hotel_rooms").select("id, check_in, check_out, edition_id").eq("booking_id", id).is("archived_at", null);
          if (bk2?.edition_id) q = q.eq("edition_id", bk2.edition_id);
          const { data: rows } = await q.limit(1);
          const row = rows?.[0];
          if (!row) return; // no room slot assigned yet — dates get set when the admin assigns one
          let edStart: string | null = null, edEnd: string | null = null;
          if (row.edition_id) {
            const { data: ed } = await client.from("exp_editions").select("date_start,date_end").eq("id", row.edition_id).maybeSingle();
            edStart = ed?.date_start ?? null; edEnd = ed?.date_end ?? null;
          }
          const roomPatch: Record<string, unknown> = {};
          if (isDate(meta.checkIn)) {
            const base = row.check_in ?? edStart;
            roomPatch.check_in = !base || meta.checkIn < base ? meta.checkIn : base;
          }
          if (isDate(meta.checkOut)) {
            const base = row.check_out ?? edEnd;
            roomPatch.check_out = !base || meta.checkOut > base ? meta.checkOut : base;
          }
          if (Object.keys(roomPatch).length) {
            await client.from("exp_hotel_rooms").update({ ...roomPatch, updated_at: new Date().toISOString() }).eq("id", row.id);
          }
        } catch (e) { console.error("[addons] room-dates sync failed:", e); }
      });
    }
  }

  // notify the member on confirm (best-effort)
  if (status === "confirmed") {
    const { data: bk } = await client
      .from("exp_bookings")
      .select("id, agreed_price, contacts(name,email), exp_experiences(title)")
      .eq("id", id).maybeSingle();
    const email = bk?.contacts?.email;
    if (email) {
      const label = data?.label ?? data?.exp_components?.name ?? "your add-on";
      const price = data?.price != null ? `€${Number(data.price).toLocaleString("en-US")}` : "";
      await sendEmail({
        to: email,
        templateKey: "addon_confirmed",
        bookingId: id,
        dedupeKey: `addon_confirmed:${body.addon_id}`,
        vars: {
          firstName: (bk?.contacts?.name ?? "").split(" ")[0] || "there",
          experienceTitle: bk?.exp_experiences?.title ?? "",
          addonLabel: label,
          addonPrice: price,
          bookingLink: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/bookings/${id}`,
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/bookings/:id/addons — remove an add-on
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const addonId = searchParams.get("addon_id");

  if (!addonId) {
    return NextResponse.json(
      { error: "addon_id is required" },
      { status: 400 }
    );
  }

  const { error } = await client
    .from("exp_booking_addons")
    .delete()
    .eq("id", addonId)
    .eq("booking_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Removing an add-on lowers the total → refresh the open pro-forma. If a real
  // invoice already covered more than the new total, this can't undo it (the
  // balance goes ≤ 0) — that case needs a credit note, handled separately.
  after(() => resyncBookingBilling(id).catch((e) => console.error("[addons] resync billing failed:", e)));

  return NextResponse.json({ success: true });
}
