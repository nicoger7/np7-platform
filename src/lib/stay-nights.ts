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

export type StayRoom = {
  hotelId: string | null;
  roomType: string | null;
  /** What the team already booked at the hotel. Often WIDER than the trip week:
   *  a guest who arranged early arrival by email has it here and nowhere else. */
  checkIn: string | null;
  checkOut: string | null;
};
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
    .select("hotel_id,room_type,check_in,check_out,booking_id,extra_booking_ids,archived_at")
    .is("archived_at", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = ((data ?? []) as any[]).find(
    (r) => r.booking_id === bookingId || (Array.isArray(r.extra_booking_ids) && r.extra_booking_ids.includes(bookingId)),
  );
  if (!row) return null;
  return {
    hotelId: row.hotel_id ?? null,
    roomType: row.room_type ?? null,
    checkIn: row.check_in ?? null,
    checkOut: row.check_out ?? null,
  };
}

/**
 * Everything the guest is already sleeping through: the trip week, widened by
 * every accommodation add-on AND by the room the team actually booked.
 *
 * That last part is not decoration. Nights arranged by hand — a guest emails
 * "I'm arriving four days early", the team widens the hotel row — exist only on
 * the room, never as an add-on. Counting against the trip week alone would
 * quote all four of those nights back to him as new.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function coveredWindow(
  editionStart: string | null,
  editionEnd: string | null,
  addons: any[],
  room?: StayRoom | null,
): CoveredWindow {
  let start = earlier(editionStart, room?.checkIn ?? null);
  let end = later(editionEnd, room?.checkOut ?? null);
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
  /*
   * Only ROOM-SPECIFIC components are filtered — the ones carrying a hotel and
   * room type, i.e. the per-night rates. Those must match the guest's own room
   * or they quote a bed at someone else's rate.
   *
   * An accommodation component WITHOUT a room link is not a night rate; it is a
   * generic extra like "Partner Upgrade (Single→Double)". Hiding those was the
   * first version of this rule and it silently removed a legitimate, bookable
   * offer — a stricter filter that costs a real sale, to guard against a
   * mispricing these rows cannot cause.
   */
  if (!component?.hotel_id || !component?.room_type) return true;
  if (!room?.hotelId || !room?.roomType) return false;
  return component.hotel_id === room.hotelId && component.room_type === room.roomType;
}

/** A per-night rate for one specific room — the kind of component that prices
 *  an extended stay. Distinguished from generic accommodation extras (a partner
 *  upgrade) purely by carrying a hotel AND a room type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRoomNight(component: any): boolean {
  return component?.category === "accommodation" && Boolean(component?.hotel_id) && Boolean(component?.room_type);
}

/**
 * Should this component appear in a member's add-on list?
 *
 * Three rules, in order:
 *
 *  1. EDITION SCOPE. A component pinned to an edition belongs to that week
 *     only. Without this an Alaçatı 2027 guest saw both the 2026 rate (€210)
 *     and the 2027 one (€231) — same name, two prices, no way to tell which is
 *     theirs. The offer list simply never checked edition_id.
 *
 *  2. THE GUEST'S OWN ROOM (matchesRoom).
 *
 *  3. Room nights are OPT-OUT, everything else stays OPT-IN. Asking to stay
 *     longer in the room you already have needs no configuration — the hotel,
 *     the room and the rate are all known — so it is offered unless someone
 *     actively blocks it (migration 190). Gear, transfers and upgrades still
 *     require addon_available, because those are real decisions per trip.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function offeredToBooking(component: any, opts: { editionId: string | null; room: StayRoom | null }): boolean {
  if (component?.edition_id && component.edition_id !== opts.editionId) return false;
  if (!matchesRoom(component, opts.room)) return false;
  return isRoomNight(component) ? component?.extra_nights_blocked !== true : component?.addon_available === true;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Deriving the stay from the ROOM rows.
 *
 * Everything above answers "how many nights is this guest adding", which is the
 * question a member asks when they extend. This answers the operator's version:
 * given the rooms we actually hold for them, what should they be billed?
 *
 * The two differ in one way that matters. Above, the stay is a single span,
 * because a guest extends at one end or the other. Here it is a span PER ROOM,
 * because a stay can change rooms half-way through — Sorobon runs out of the
 * studio on the 7th and moves the guest to a beach house, and those three
 * nights cost EUR 110 more each. A single span cannot express that, and a
 * hand-written add-on gets it wrong: the real case that prompted this had one
 * row of five studio nights standing in for three studio and three beach-house
 * nights, and was short a night as well.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A run of consecutive nights in one room. `to` is the check-out date, so the
 *  nights are [from, to) and `nights` is their count. */
export type StaySegment = {
  hotelId: string | null;
  roomType: string | null;
  from: string;
  to: string;
  nights: number;
};

export type StayDerivation = {
  /** Every night slept, across every room row. */
  stay: CoveredWindow;
  /** Nights OUTSIDE the package week, grouped by the room slept in. These are
   *  the billable ones. */
  extra: StaySegment[];
  /**
   * Nights INSIDE the package week spent in a room type the package does not
   * sell — a forced upgrade, e.g. the hotel cannot hold the booked room.
   *
   * Deliberately NOT priced. Whether the guest pays the difference or NP7
   * absorbs it is a commercial decision about whose fault the move was, and a
   * derivation that quietly billed for it would charge people for the hotel's
   * availability problem.
   */
  upgrades: StaySegment[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(day) + n * DAY));

/**
 * One entry per night slept, mapped to the room slept in.
 *
 * Later rows win on an overlap. Two rows covering the same night is a data
 * error rather than a real double booking, and taking the later one matches how
 * a move is entered: the original stay is shortened and the new room added, but
 * if the shortening is forgotten the NEW room is still the truth.
 */
function nightsByRoom(rooms: StayRoom[]): Map<string, StayRoom> {
  const map = new Map<string, StayRoom>();
  for (const r of rooms) {
    if (!r.checkIn || !r.checkOut) continue; // an undated row describes no nights
    for (let d = r.checkIn; d < r.checkOut; d = addDays(d, 1)) map.set(d, r);
  }
  return map;
}

/** Collapse consecutive nights in the same room into one segment. */
function segmentize(nightList: [string, StayRoom][]): StaySegment[] {
  const out: StaySegment[] = [];
  for (const [day, room] of nightList) {
    const last = out[out.length - 1];
    const contiguous =
      last && last.to === day && last.hotelId === (room.hotelId ?? null) && last.roomType === (room.roomType ?? null);
    if (contiguous) {
      last.to = addDays(day, 1);
      last.nights += 1;
    } else {
      out.push({
        hotelId: room.hotelId ?? null,
        roomType: room.roomType ?? null,
        from: day,
        to: addDays(day, 1),
        nights: 1,
      });
    }
  }
  return out;
}

export function deriveStay(
  rooms: StayRoom[],
  editionStart: string | null,
  editionEnd: string | null,
  packageRoomType: string | null,
): StayDerivation {
  const byNight = nightsByRoom(rooms);
  const all = [...byNight.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (all.length === 0) return { stay: { start: null, end: null }, extra: [], upgrades: [] };

  // The package week covers [editionStart, editionEnd) — check-out day is not a
  // night. With no dates on the edition nothing is included, so every night the
  // guest sleeps reads as extra; that is the honest answer, not a silent zero.
  const included = (day: string) =>
    Boolean(editionStart && editionEnd && day >= editionStart && day < editionEnd);

  const extraNights = all.filter(([d]) => !included(d));
  const insideNights = all.filter(
    ([d, r]) => included(d) && packageRoomType != null && (r.roomType ?? null) !== packageRoomType,
  );

  return {
    stay: { start: all[0][0], end: addDays(all[all.length - 1][0], 1) },
    extra: segmentize(extraNights),
    upgrades: segmentize(insideNights),
  };
}
