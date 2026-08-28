/**
 * Extra-night arithmetic. This decides what a guest is charged, so the cases
 * that used to bill twice are pinned here rather than trusted.
 *
 * Scenario throughout: a trip week running Sat 12 Sep → Sat 19 Sep 2026.
 */
import { describe, it, expect } from "vitest";
import { coveredWindow, newNights, matchesRoom, offeredToBooking } from "@/lib/stay-nights";

const START = "2026-09-12";
const END = "2026-09-19";
const week = (addons: unknown[] = []) => coveredWindow(START, END, addons);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stay = (checkIn: string, checkOut: string, status = "confirmed"): any => ({
  status,
  meta: { checkIn, checkOut },
});

describe("covered window", () => {
  it("with no add-ons, the guest is covered for the trip week only", () => {
    expect(week()).toEqual({ start: START, end: END });
  });

  it("widens at both ends as nights are added", () => {
    expect(week([stay("2026-09-10", END), stay(START, "2026-09-21")]))
      .toEqual({ start: "2026-09-10", end: "2026-09-21" });
  });

  it("ignores a declined row — 'no add-ons needed' is not a stay", () => {
    expect(week([stay("2026-09-01", "2026-09-30", "declined")]))
      .toEqual({ start: START, end: END });
  });

  it("counts a still-pending request, so a double-tap cannot double-charge", () => {
    expect(week([stay(START, "2026-09-21", "requested")]).end).toBe("2026-09-21");
  });

  /* Nights the team arranged by hand live ONLY on the hotel row. Christian
     Skodde's Kas Chicitu room runs 3–13 Dec against a 7–14 Dec week. */
  it("counts the room the team actually booked, not just the trip week", () => {
    const hand = { hotelId: "h", roomType: "Kas Chicitu", checkIn: "2026-09-08", checkOut: "2026-09-20" };
    expect(coveredWindow(START, END, [], hand)).toEqual({ start: "2026-09-08", end: "2026-09-20" });
  });

  it("an early arrival on the room row is not quoted back as new", () => {
    const hand = { hotelId: "h", roomType: "r", checkIn: "2026-09-08", checkOut: END };
    // He arrived 8 Sep by arrangement; asking for the 7th is ONE more night.
    expect(newNights(coveredWindow(START, END, [], hand), "2026-09-07", END).total).toBe(1);
    // Without the room row this said 5 — the four nights he already had, again.
    expect(newNights(coveredWindow(START, END, []), "2026-09-07", END).total).toBe(5);
  });
});

describe("new nights", () => {
  it("charges nights after the week", () => {
    expect(newNights(week(), START, "2026-09-22")).toEqual({ before: 0, after: 3, total: 3 });
  });

  it("charges nights before the week", () => {
    expect(newNights(week(), "2026-09-10", END)).toEqual({ before: 2, after: 0, total: 2 });
  });

  it("charges both ends of one request", () => {
    expect(newNights(week(), "2026-09-10", "2026-09-21")).toEqual({ before: 2, after: 2, total: 4 });
  });

  /** The regression this whole change exists for. */
  it("extending an extended stay charges ONLY the new night", () => {
    const already = week([stay(START, "2026-09-21")]); // guest holds 2 nights after
    const q = newNights(already, START, "2026-09-22"); // now wants a 3rd
    expect(q.total).toBe(1);
    expect(q.total).not.toBe(3); // the old maths billed all three again
  });

  it("a request entirely inside the current stay costs nothing", () => {
    const already = week([stay("2026-09-10", "2026-09-21")]);
    expect(newNights(already, "2026-09-11", "2026-09-20").total).toBe(0);
  });

  it("re-submitting the exact same dates costs nothing", () => {
    const already = week([stay(START, "2026-09-21")]);
    expect(newNights(already, START, "2026-09-21").total).toBe(0);
  });

  it("missing dates never invent nights", () => {
    expect(newNights(week(), null, null).total).toBe(0);
    expect(newNights({ start: null, end: null }, START, END).total).toBe(0);
  });
});

describe("room matching", () => {
  const room = { hotelId: "h-sorobon", roomType: "Garden View Studio", checkIn: null, checkOut: null };
  const comp = (o: Record<string, unknown>) => ({ category: "accommodation", ...o });

  it("offers the guest's own hotel and room type", () => {
    expect(matchesRoom(comp({ hotel_id: "h-sorobon", room_type: "Garden View Studio" }), room)).toBe(true);
  });

  it("refuses another hotel", () => {
    expect(matchesRoom(comp({ hotel_id: "h-wanapa", room_type: "Garden View Studio" }), room)).toBe(false);
  });

  it("refuses a different room type in the same hotel", () => {
    expect(matchesRoom(comp({ hotel_id: "h-sorobon", room_type: "Ocean Front Beach House" }), room)).toBe(false);
  });

  it("keeps an UNLINKED accommodation extra — a partner upgrade is not a night rate", () => {
    expect(matchesRoom(comp({ hotel_id: null, room_type: null }), room)).toBe(true);
    expect(matchesRoom(comp({ hotel_id: null, room_type: null }), null)).toBe(true);
  });

  it("hides a room-specific rate when we don't know where the guest sleeps", () => {
    expect(matchesRoom(comp({ hotel_id: "h-sorobon", room_type: "Garden View Studio" }), null)).toBe(false);
  });

  it("leaves non-accommodation extras alone — gear and transfers are for everyone", () => {
    expect(matchesRoom({ category: "gear", hotel_id: null, room_type: null }, room)).toBe(true);
    expect(matchesRoom({ category: "transfer" }, null)).toBe(true);
  });
});

describe("what a member is offered", () => {
  const room = { hotelId: "h-sorobon", roomType: "Garden View Studio", checkIn: null, checkOut: null };
  const here = { editionId: "ed-2027", room };
  const night = (o: Record<string, unknown> = {}) => ({
    category: "accommodation", hotel_id: "h-sorobon", room_type: "Garden View Studio", ...o,
  });

  it("offers the guest's own room night WITHOUT anyone ticking a box", () => {
    // The whole point of migration 190: Bonaire had forty guests who could not
    // ask for a night because addon_available was never set.
    expect(offeredToBooking(night({ addon_available: false }), here)).toBe(true);
  });

  it("respects an explicit block", () => {
    expect(offeredToBooking(night({ extra_nights_blocked: true }), here)).toBe(false);
  });

  it("hides last year's rate — the edition-scope bug", () => {
    // Alaçatı: same name, €210 pinned to 2026 and €231 to 2027.
    expect(offeredToBooking(night({ edition_id: "ed-2026" }), here)).toBe(false);
    expect(offeredToBooking(night({ edition_id: "ed-2027" }), here)).toBe(true);
  });

  it("keeps an unscoped component available to every week", () => {
    expect(offeredToBooking(night({ edition_id: null }), here)).toBe(true);
  });

  it("still refuses another guest's room", () => {
    expect(offeredToBooking(night({ hotel_id: "h-wanapa" }), here)).toBe(false);
  });

  it("leaves generic extras opt-IN — gear is a decision per trip", () => {
    const gear = { category: "gear", addon_available: false };
    expect(offeredToBooking(gear, here)).toBe(false);
    expect(offeredToBooking({ ...gear, addon_available: true }, here)).toBe(true);
  });

  it("treats an unlinked accommodation extra as a generic opt-in", () => {
    const upgrade = { category: "accommodation", hotel_id: null, room_type: null };
    expect(offeredToBooking(upgrade, here)).toBe(false);
    expect(offeredToBooking({ ...upgrade, addon_available: true }, here)).toBe(true);
  });
});
