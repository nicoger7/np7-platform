import "server-only";

/**
 * Put a newly-secured booking into a room of the type its package sells.
 *
 * The package has always known the answer — `exp_packages.room_type` +
 * `hotel_id` is what the guest bought — but nothing acted on it, so every
 * booking waited for somebody to open Hotel Rooms and connect the dots by
 * hand. On Bonaire alone that backlog reached eleven bookings, one of whom
 * had been sleeping in no room at all as far as the system knew, while his
 * five extra nights were priced against nothing.
 *
 * Runs when a booking becomes SECURED (reserved/confirmed), never at lead:
 * a lead is a free signup that may never pay, and a room is blocked at the
 * hotel the moment it is assigned — leads hogging beds would starve the
 * guests who actually committed.
 *
 * Rules, in order of what they refuse to guess:
 *  - already housed (own row or as a companion via extra_booking_ids) → done;
 *  - kind='event' or a "No Hotel" package or no room_type → nothing to assign;
 *  - only a GENUINELY free room qualifies: unarchived, unreleased, no guest,
 *    no companions. `sleeps` is unset on every room in production, so this
 *    never doubles people up — it cannot know whether a second bed exists;
 *  - among free rooms, one the hotel has already blocked (it has dates) beats
 *    an undated placeholder;
 *  - no free room of the right type → report it, assign nothing. Never a
 *    different room type: an upgrade or downgrade is a human decision.
 *
 * Undated rooms get the edition window on assignment — the package covers the
 * week, so that is the stay until something truer (extra nights) widens it.
 *
 * Best-effort by design: returns an outcome, never throws. A failed room
 * assignment must not fail the payment or status change that triggered it.
 */

export type RoomAssignOutcome =
  | { outcome: "assigned"; room: string }
  | { outcome: "already-housed"; room: string }
  | { outcome: "not-applicable"; reason: string }
  | { outcome: "no-free-room"; roomType: string }
  | { outcome: "error"; reason: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoAssignRoom(db: any, bookingId: string): Promise<RoomAssignOutcome> {
  try {
    const { data: b } = await db
      .from("exp_bookings")
      .select("id, edition_id, package_id, exp_editions(kind, date_start, date_end), exp_packages(name, room_type, hotel_id)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) return { outcome: "error", reason: "booking not found" };
    if (!b.edition_id) return { outcome: "not-applicable", reason: "no edition" };
    if (b.exp_editions?.kind === "event") return { outcome: "not-applicable", reason: "an event needs no bed" };
    const roomType: string | null = b.exp_packages?.room_type ?? null;
    const hotelId: string | null = b.exp_packages?.hotel_id ?? null;
    if (!roomType) return { outcome: "not-applicable", reason: "package sells no room" };

    const { data: rooms } = await db
      .from("exp_hotel_rooms")
      .select("id, name, room_type, hotel_id, booking_id, extra_booking_ids, check_in, check_out, archived_at, released_at")
      .eq("edition_id", b.edition_id)
      .is("archived_at", null)
      .is("released_at", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (rooms ?? []) as any[];

    const mine = all.find(
      (r) => r.booking_id === bookingId || (Array.isArray(r.extra_booking_ids) && r.extra_booking_ids.includes(bookingId)),
    );
    if (mine) return { outcome: "already-housed", room: mine.name ?? "a room" };

    const free = all
      .filter(
        (r) =>
          r.room_type === roomType &&
          (!hotelId || !r.hotel_id || r.hotel_id === hotelId) &&
          !r.booking_id &&
          !(r.extra_booking_ids ?? []).length,
      )
      // hotel-blocked (dated) rooms first — they are real inventory, not placeholders
      .sort((a, b2) => Number(a.check_in == null) - Number(b2.check_in == null) || String(a.name).localeCompare(String(b2.name)));
    if (!free.length) return { outcome: "no-free-room", roomType };

    const pick = free[0];
    const patch: Record<string, unknown> = { booking_id: bookingId, status: "assigned", updated_at: new Date().toISOString() };
    if (!pick.check_in && !pick.check_out && b.exp_editions?.date_start) {
      patch.check_in = b.exp_editions.date_start;
      patch.check_out = b.exp_editions.date_end;
    }
    // The guard against a race: only claim the room if it is STILL empty.
    const { data: claimed, error } = await db
      .from("exp_hotel_rooms")
      .update(patch)
      .eq("id", pick.id)
      .is("booking_id", null)
      .select("name")
      .maybeSingle();
    if (error) return { outcome: "error", reason: error.message };
    if (!claimed) return { outcome: "no-free-room", roomType }; // somebody took it between read and write
    return { outcome: "assigned", room: claimed.name ?? pick.name };
  } catch (e) {
    return { outcome: "error", reason: e instanceof Error ? e.message : "unknown" };
  }
}

/** Did this status change just secure the booking? The transition INTO a
 *  secured state is the one moment a bed becomes worth blocking. */
export function becameSecured(oldStatus: string | null | undefined, newStatus: string | null | undefined): boolean {
  const secured = (s: string | null | undefined) => s === "reserved" || s === "confirmed" || s === "paid" || s === "attended";
  return !secured(oldStatus) && secured(newStatus);
}
