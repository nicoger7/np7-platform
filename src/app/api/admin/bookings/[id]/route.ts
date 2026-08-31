import { NextRequest, NextResponse, after } from "next/server";
import { autoAssignRoom, becameSecured } from "@/lib/room-assign";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { dbErrorMessage } from "@/lib/admin-errors";
import { effectiveCanSeeField } from "@/lib/access";

// GET /api/admin/bookings/:id — get booking with all related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const [booking, payments, addons, tasks, hotelRooms] = await Promise.all([
    client
      .from("exp_bookings")
      .select(
        "*, contacts(name, email, phone, country, level, tshirt_size, diet_allergies), exp_experiences(title, slug), exp_editions(year, date_start, date_end, deposit, kind), exp_packages(name, price, deposit, downpayment_percent, final_days_before, deposit_refund_days)"
      )
      .eq("id", id)
      .single(),
    client
      .from("exp_payments")
      .select("*")
      .eq("booking_id", id)
      .order("date", { ascending: false }),
    client.from("exp_booking_addons").select("*, exp_components(*)").eq("booking_id", id),
    client
      .from("exp_tasks")
      .select("*")
      .eq("booking_id", id)
      .order("due_date"),
    // A guest sleeps in a room in one of two ways: it is THEIR row
    // (booking_id), or they share someone else's (extra_booking_ids, the
    // "Also in this room" list). Matching only booking_id made the link
    // one-directional — the Hotel Rooms page showed the sharer in the room
    // while their own booking claimed "No hotel rooms assigned".
    client
      .from("exp_hotel_rooms")
      .select("*")
      // Archived = soft-deleted. It vanishes from the Hotel Rooms page but was
      // still shown on the booking, so a room someone deleted (Stephan Swart's
      // extra-nights room, archived while it stayed linked to his booking) read
      // as an active assignment here and nowhere else — the two views disagreed.
      .is("archived_at", null)
      .or(`booking_id.eq.${id},extra_booking_ids.cs.{${id}}`),
  ]);

  if (booking.error) {
    return NextResponse.json(
      { error: booking.error.message },
      { status: 404 }
    );
  }

  // On a shared room the row belongs to someone else's booking — say whose,
  // so the UI can render "sharing — main guest: <name>" instead of implying
  // the guest holds a room of their own.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rooms: Record<string, any>[] = hotelRooms.data || [];
  const mainIds = [...new Set(rooms.filter((r) => r.booking_id && r.booking_id !== id).map((r) => r.booking_id as string))];
  if (mainIds.length) {
    const { data: mains } = await client.from("exp_bookings").select("id, contacts(name)").in("id", mainIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameById = new Map(((mains ?? []) as any[]).map((b) => [b.id, b.contacts?.name ?? null]));
    for (const r of rooms) {
      if (r.booking_id && r.booking_id !== id) r.main_guest_name = nameById.get(r.booking_id) ?? null;
    }
  }

  // Group bookings (migration 198): who pays for this one / whom it pays for,
  // and the edition's other bookings so the Details tab can offer the link
  // without a second request.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bd: any = booking.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyClient = client as any; // covered_by_booking_id is newer than database.types.ts
  const [covererRow, coversRows, peersRows] = await Promise.all([
    bd?.covered_by_booking_id
      ? anyClient.from("exp_bookings").select("id, contacts(name)").eq("id", bd.covered_by_booking_id).maybeSingle()
      : Promise.resolve({ data: null }),
    anyClient.from("exp_bookings").select("id, agreed_price, contacts(name)").eq("covered_by_booking_id", id),
    bd?.edition_id
      ? anyClient.from("exp_bookings").select("id, status, contacts(name)").eq("edition_id", bd.edition_id).neq("id", id)
      : Promise.resolve({ data: [] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let out: Record<string, any> = {
    ...booking.data,
    payments: payments.data || [],
    addons: addons.data || [],
    tasks: tasks.data || [],
    hotel_rooms: rooms,
    group: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      covered_by: covererRow.data ? { id: (covererRow.data as any).id, name: (covererRow.data as any).contacts?.name ?? null } : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      covers: ((coversRows.data ?? []) as any[]).map((b) => ({ id: b.id, name: b.contacts?.name ?? null, agreed_price: b.agreed_price ?? null })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edition_peers: ((peersRows.data ?? []) as any[]).map((b) => ({ id: b.id, name: b.contacts?.name ?? null, status: b.status ?? null })),
    },
  };

  // Field redaction by role: money (prices/payments), costs (component costs),
  // contact PII (email/phone). Owner/manager tiers see everything.
  const access = await getRequestAccess();
  if (access) {
    if (!effectiveCanSeeField(access, "money")) {
      out = { ...out, agreed_price: null, deposit: null, exp_packages: out.exp_packages ? { ...out.exp_packages, price: null } : out.exp_packages, payments: [], money_redacted: true };
    }
    if (!effectiveCanSeeField(access, "costs")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.addons = (out.addons || []).map((a: any) => ({ ...a, exp_components: a.exp_components ? { ...a.exp_components, unit_cost: null } : a.exp_components }));
    }
    if (!effectiveCanSeeField(access, "contact_pii")) {
      out.contacts = out.contacts ? { ...out.contacts, email: null, phone: null, diet_allergies: null } : out.contacts;
    }
  }

  return NextResponse.json(out);
}

// PATCH /api/admin/bookings/:id — update booking (status change, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // The previous status, read before the write — the room assignment below
  // fires on the TRANSITION into a secured state, not on every save of an
  // already-secured booking.
  let oldStatus: string | null = null;
  if (typeof body.status === "string") {
    const { data: prev } = await client.from("exp_bookings").select("status").eq("id", id).maybeSingle();
    oldStatus = (prev as { status?: string | null } | null)?.status ?? null;
  }

  // Same two guards the create route applies — an edit can put a booking into
  // exactly the states creation refuses (no guest, negative price).
  if ("agreed_price" in body && body.agreed_price != null && Number(body.agreed_price) < 0) {
    return NextResponse.json({ error: "The price can't be negative. Use a payment or a credit note to give money back." }, { status: 400 });
  }
  if ("contact_id" in body && !body.contact_id) {
    return NextResponse.json({ error: "A booking needs a guest — it can't be cleared." }, { status: 400 });
  }

  const { data, error } = await client
    .from("exp_bookings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: dbErrorMessage(error, "Couldn't save the booking — please try again.") }, { status: 400 });
  }

  /*
   * Securing the spot is when the bed becomes real: put the guest into a free
   * room of the type their package sells. Best-effort and AFTER the response —
   * the status change must never fail because the hotel sheet is odd, and
   * "no-free-room" is a state the Hotel Rooms page shows, not an error.
   */
  /*
   * Dropped out? Hand the bed back.
   *
   * The "Cancel booking…" dialog already releases the room, but the status
   * dropdown is the other door to the same outcome — and it left the room
   * `assigned` with the guest's dates on it. Nobody sees a held bed for a lost
   * booking until the hotel sheet is read by hand in the season, so the week
   * looks one room fuller than it is. Best-effort and AFTER the response: the
   * status change must never fail because the hotel sheet is odd.
   *
   * Deliberately NOT touching rooms shared with someone else
   * (extra_booking_ids): that bed belongs to the guest who still holds it.
   */
  const becameLost = (s: string | null | undefined) => String(s ?? "").toLowerCase() === "lost" || String(s ?? "").toLowerCase() === "cancelled";
  if (typeof body.status === "string" && becameLost(body.status) && !becameLost(oldStatus)) {
    after(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (client as any)
        .from("exp_hotel_rooms")
        .update({
          booking_id: null, status: "available", hotel_confirmed: false, hotel_confirmed_at: null,
          check_in: null, check_out: null, transfer_need: false, partner_tag_along: null,
          updated_at: new Date().toISOString(),
        })
        .eq("booking_id", id)
        .is("archived_at", null);
      if (error) console.error("[rooms] release on lost failed:", error.message);
      else console.log(`[rooms] released bed(s) held by lost booking ${id}`);
    });
  }

  if (typeof body.status === "string" && becameSecured(oldStatus, body.status)) {
    after(async () => {
      const r = await autoAssignRoom(client, id);
      if (r.outcome === "assigned") console.log(`[rooms] auto-assigned ${r.room} to booking ${id}`);
      else if (r.outcome === "no-free-room") console.warn(`[rooms] no free ${r.roomType} for booking ${id}`);
    });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/bookings/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { error } = await client.from("exp_bookings").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
