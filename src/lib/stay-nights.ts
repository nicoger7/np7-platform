import "server-only";

/**
 * Extra nights, priced against the room the guest is ACTUALLY in.
 *
 * Two rules make this correct, and both were missing before:
 *
 *  1. A guest is only offered nights in their OWN hotel and room type. The old
 *     list offered every accommodation component in the experience, so someone
 *     at Sorobon could book a Wanapa night at a Wanapa price.
 *
 *  2. Only NEW nights are charged. Nights were computed against the trip week
 *     alone, so a guest who already had two extra nights and then extended by
 *     one was quoted three — and billed for two he had already paid for.
 *
 * The covered window is a single span rather than a set of dates: people extend
 * their stay at one end or the other, they do not book a night, skip one, and
 * book again. Treating it as a span keeps the arithmetic obvious.
 */

export type StayRoom = { hotelId: string | null; roomType: string | null };
export type CoveredWindow = { start: string | null; end: string | null };

const DAY = 86_400_000;
const nights = (from: string | null, to: string | null) =>
  from && to ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY)) : 0;
const earlier = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Which room this booking sleeps in — including as a companion on someone
 * else's room row (extra_booking_ids), because a partner sharing a room extends
 * the same room, at the same rate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guestRoom(db: any, bookingId: string): Promise<StayRoom | null> {
  const { data } = await db
    .from("exp_hotel_rooms")
    .select("hotel_id,room_type,booking_id,extra_booking_ids,archived_at")
    .is("archived_at", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = ((data ?? []) as any[]).find(
    (r) => r.booking_id === bookingId || (Array.isArray(r.extra_booking_ids) && r.extra_booking_ids.includes(bookingId)),
  );
  if (!row) return null;
  return { hotelId: row.hotel_id ?? null, roomType: row.room_type ?? null };
}

/**
 * Everything the guest is already sleeping through: the trip week, widened by
 * every accommodation add-on already requested or confirmed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function coveredWindow(editionStart: string | null, editionEnd: string | null, addons: any[]): CoveredWindow {
  let start = editionStart;
  let end = editionEnd;
  for (const a of addons ?? []) {
    const m = a?.meta;
    if (!m || typeof m !== "object") continue;
    // A declined row is a "no thanks" marker, not a stay.
    if (a.status === "declined") continue;
    if (typeof m.checkIn === "string") start = earlier(start, m.checkIn);
    if (typeof m.checkOut === "string") end = later(end, m.checkOut);
  }
  return { start, end };
}

/**
 * The nights in [checkIn, checkOut] that fall OUTSIDE what is already covered.
 * A request entirely inside the covered window costs nothing and returns 0 —
 * which the caller turns into "you already have those nights" rather than a
 * second charge for the same bed.
 */
export function newNights(
  covered: CoveredWindow,
  checkIn: string | null,
  checkOut: string | null,
): { before: number; after: number; total: number } {
  const before = nights(checkIn, covered.start);
  const after = nights(covered.end, checkOut);
  return { before, after, total: before + after };
}

/** Is this component the guest's own room? Accommodation only — everything else
 *  (gear, transfers, lessons) is offered to everybody as before. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function matchesRoom(component: any, room: StayRoom | null): boolean {
  if (component?.category !== "accommodation") return true;
  // Unlinked components stay hidden rather than mispriced: a component with no
  // hotel cannot be checked against the guest's room, and offering the wrong
  // room at the wrong rate is worse than offering nothing.
  if (!component?.hotel_id || !component?.room_type) return false;
  if (!room?.hotelId || !room?.roomType) return false;
  return component.hotel_id === room.hotelId && component.room_type === room.roomType;
}
