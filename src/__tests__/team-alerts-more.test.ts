/**
 * The team hears about every sign-up and every order (Nico, 27/28 Sep 2026).
 *
 * Each alert is a sweep over the table the event lands in, and each has one
 * job: pick exactly the rows that are news, and mail each one once per
 * recipient. What is pinned here is the SELECTION: which rows count, which do
 * not, and the key that stops a rerun mailing twice. The database is the
 * in-memory PostgREST stand-in; recipients come from its team_mail_recipients
 * table, exactly as they do in production.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

type Sent = { to: string; templateKey: string; vars: Record<string, string | undefined>; dedupeKey?: string; manual?: boolean; division?: string; bookingId?: string | null };

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase, sent: [] as Sent[], user: null as null | { contactId: string; name: string } }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (a: Sent) => {
    // The real sender skips a key it has already logged; so does this.
    if (a.dedupeKey && state.sent.some((s) => s.dedupeKey === a.dedupeKey)) return { status: "skipped" };
    state.sent.push(a);
    return { status: "sent" };
  },
}));
vi.mock("@/lib/auth", () => ({ getPortalUser: async () => state.user }));

import { TEAM_EVENTS, isBookingNews, sweepNewBookings, money, inviteRewardLine, isInviteBookingSecured } from "@/lib/email/team-alerts";
import {
  isPaymentNews, sweepPayments, methodLabel, announceTransferProblem, sweepGuestRequests, sweepCancellationRequests,
  sweepWiderrufe, sweepAccountSignups, likelyTypo, sweepSignatureApplications, sweepReviews,
} from "@/lib/email/team-alerts-guests";
import { sweepHwOrders, sweepHwReturns, sweepHwEnquiries } from "@/lib/email/team-alerts-hardware";
import { guestRequestNote, guestRequestsIn } from "@/lib/guest-request";
import { renderTemplate } from "@/lib/email/templates";
import { DEFAULT_BODIES, DEFAULT_SUBJECTS } from "@/lib/email/default-bodies";
import { TEAM_CANCELLATION_REMINDER } from "@/lib/cancellation-policy";
import { POST as cancelTrip } from "@/app/api/portal/bookings/[id]/cancel/route";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SINCE = "2026-09-28T06:00:00.000Z";
const IN = "2026-09-28T09:00:00.000Z";
const BEFORE = "2026-09-27T20:00:00.000Z";

/** Simona and the shared inbox on every event, the way migration 264 seeds it. */
const subscribe = (...events: string[]): Row[] =>
  events.flatMap((e) => [
    { id: `${e}-s`, event_key: e, email: "simona@np-seven.com", name: "Simona", enabled: true },
    { id: `${e}-x`, event_key: e, email: "experience@np-seven.com", name: "Experience inbox", enabled: true },
  ]);

const trip = { exp_experiences: { title: "NP7 Experience Bonaire", currency: "EUR" }, exp_editions: { label: "Week I", date_start: "2026-11-14", date_end: "2026-11-21" } };

beforeEach(() => {
  state.sent = [];
  state.user = null;
  state.db = new FakeSupabase({ team_mail_recipients: [] });
});

// ─── booking_created ─────────────────────────────────────────────────────────

describe("booking_created: which rows are a new booking", () => {
  it("skips lost, companions, attended, [ARCHIVE] and TEST rows", () => {
    expect(isBookingNews({ status: "lead" })).toBe(true);
    expect(isBookingNews({ status: "lost" })).toBe(false);
    expect(isBookingNews({ status: "confirmed", covered_by_booking_id: "payer" })).toBe(false);
    expect(isBookingNews({ status: "attended" })).toBe(false);
    expect(isBookingNews({ status: "confirmed", name: "[ARCHIVE] Pre-platform trip" })).toBe(false);
    expect(isBookingNews({ status: "confirmed", notes: "Backfill [ARCHIVE] 2019" })).toBe(false);
    expect(isBookingNews({ status: "lead", name: "TEST booking Nico" })).toBe(false);
    expect(isBookingNews({ status: "lead", notes: "this is a test Booking, ignore" })).toBe(false);
    expect(isBookingNews({ status: "lead", contacts: { name: "Test booking" } })).toBe(false);
  });

  it("matches 'test booking' as whole words only, so 'latest booking' is still news", () => {
    // Review, 28 Sep 2026: /test booking/ without word boundaries skipped a
    // real booking whose note said "moved from his latest booking".
    expect(isBookingNews({ status: "lead", notes: "moved from his latest booking" })).toBe(true);
    expect(isBookingNews({ status: "lead", name: "Contest booking prize" })).toBe(true);
    expect(isBookingNews({ status: "lead", contacts: { name: "Greatest Booking" } })).toBe(true);
    expect(isBookingNews({ status: "lead", notes: "TEST booking, ignore" })).toBe(false);
  });

  const booking = (over: Row): Row => ({
    id: "b1", created_at: IN, status: "lead", name: "Lena Ott", agreed_price: 2390, covered_by_booking_id: null,
    package_id: "p1", invite_id: null, notes: "Website registration · package: No Hotel",
    contacts: { name: "Lena Ott", email: "lena@example.com" }, exp_packages: { name: "No Hotel" }, ...trip, ...over,
  });

  it("says when the bot check flagged the sign-up", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("booking_created"),
      exp_bookings: [booking({ notes: "Website registration · package: No Hotel · ⚠ BOT-CHECK FLAGGED · verify before invoicing" })],
    });
    await sweepNewBookings({ since: SINCE });
    expect(state.sent).toHaveLength(2);
    expect(state.sent[0].vars.botCheck).toBe("Bot check flagged, verify before invoicing.");
    expect(state.sent[0].manual).toBe(true);
  });

  it("names the inviter when the booking came through an invite", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("booking_created"),
      exp_bookings: [booking({ invite_id: "inv1" })],
      trip_invites: [{ id: "inv1", inviter_contact_id: "c-paul" }],
      contacts: [{ id: "c-paul", name: "Paul Weber", email: "paul@example.com" }],
    });
    await sweepNewBookings({ since: SINCE });
    // A fresh lead has paid nothing, so no reward is owed yet (review, 28 Sep 2026).
    expect(state.sent[0].vars.inviteLine).toBe("Came through Paul Weber's invite. The friend reward becomes due once they pay.");
    expect(state.sent[0].vars.botCheck).toBeUndefined();
  });

  it("says the friend reward is due only once the booking is secured", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("booking_created"),
      exp_bookings: [booking({ invite_id: "inv1", status: "confirmed", downpayment_received: true })],
      trip_invites: [{ id: "inv1", inviter_contact_id: "c-paul" }],
      contacts: [{ id: "c-paul", name: "Paul Weber", email: "paul@example.com" }],
    });
    await sweepNewBookings({ since: SINCE });
    expect(state.sent[0].vars.inviteLine).toBe("Came through Paul Weber's invite, so a friend reward is now due.");
  });

  it("the invite line follows the money, and an info request earns nothing", () => {
    const due = "Came through Paul's invite, so a friend reward is now due.";
    const later = "Came through Paul's invite. The friend reward becomes due once they pay.";
    expect(inviteRewardLine("Paul", { status: "lead" })).toBe(later);
    expect(inviteRewardLine("Paul", { status: "reserved" })).toBe(later);
    expect(inviteRewardLine("Paul", { status: "lead", deposit_received: true })).toBe(due);
    expect(inviteRewardLine("Paul", { status: "lead", downpayment_received: true })).toBe(due);
    expect(inviteRewardLine("Paul", { status: "confirmed" })).toBe(due);
    expect(inviteRewardLine("Paul", { status: "paid" })).toBe(due);
    expect(inviteRewardLine("Paul", { status: "downpayment_paid" })).toBe(due); // legacy spelling of confirmed
    expect(inviteRewardLine("Paul", { status: "lead", notes: "Website registration · package: No Hotel · friend invite (info request)" }))
      .toBe("Asked for info through Paul's invite. No reward yet.");
    expect(inviteRewardLine(null, { status: "lead" })).toBe("Came through a friend's invite. The friend reward becomes due once they pay.");
    // A lost booking is never secured, whatever flags it still carries.
    expect(isInviteBookingSecured({ status: "lost", downpayment_received: true })).toBe(false);
  });

  it("gives a group payer's mail the companions and the group total, and skips the companions", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("booking_created"),
      exp_bookings: [
        booking({}),
        booking({ id: "b2", name: "Anna Berg", covered_by_booking_id: "b1", agreed_price: 2000, contacts: { name: "Anna Berg", email: "anna@example.com" } }),
        booking({ id: "b3", name: "Tom Berg", covered_by_booking_id: "b1", agreed_price: 1800.5, contacts: { name: "Tom Berg", email: null } }),
      ],
      exp_booking_addons: [],
    });
    await sweepNewBookings({ since: SINCE });
    expect(state.sent.map((s) => s.bookingId)).toEqual(["b1", "b1"]);
    expect(state.sent[0].vars.companions).toBe("Anna Berg, Tom Berg");
    expect(state.sent[0].vars.groupTotal).toBe("€6,190.50 for 3 people");
  });

  it("does not announce an archive import, an attended row or a test", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("booking_created"),
      exp_bookings: [
        booking({ id: "a1", status: "attended", name: "[ARCHIVE] Pre-platform trip" }),
        booking({ id: "a2", status: "attended" }),
        booking({ id: "a3", name: "TEST booking" }),
      ],
    });
    const r = await sweepNewBookings({ since: SINCE });
    expect(r.announced).toBe(0);
    expect(state.sent).toHaveLength(0);
  });

  it("money keeps cents only when there are cents", () => {
    expect(money(2390)).toBe("€2,390");
    expect(money(1399.5)).toBe("€1,399.50");
    expect(money(null)).toBeNull();
  });
});

// ─── payment_received ────────────────────────────────────────────────────────

describe("payment_received", () => {
  it("is a Stripe row with a pi_ reference, or a voucher used on a booking", () => {
    const base = { amount: 700, status: "paid", direction: "revenue", type: "downpayment" };
    expect(isPaymentNews({ ...base, method: "stripe", reference: "pi_123" })).toBe(true);
    expect(isPaymentNews({ ...base, method: "voucher", reference: "NP7-AAAA" })).toBe(true);
    // A bank-feed row connected by hand, a refund, a cost, a pending plan row.
    expect(isPaymentNews({ ...base, method: "stripe", reference: "stripe:pi_123" })).toBe(false);
    expect(isPaymentNews({ ...base, method: "stripe", reference: "re_123", type: "refund", amount: -100 })).toBe(false);
    expect(isPaymentNews({ ...base, method: "stripe", reference: "pi_1", direction: "cost" })).toBe(false);
    expect(isPaymentNews({ ...base, method: "stripe", reference: "pi_1", status: "pending" })).toBe(false);
    expect(isPaymentNews({ ...base, method: "bank_transfer", reference: "NP7-XP-1" })).toBe(false);
  });

  it("announces each new payment once per recipient, keyed on the payment", async () => {
    const pay = (over: Row): Row => ({
      id: "pay1", booking_id: "b1", amount: 1195, type: "downpayment", method: "stripe", reference: "pi_abc",
      notes: "Stripe bank transfer · link l1", direction: "revenue", status: "paid", created_at: IN,
      exp_bookings: { id: "b1", agreed_price: 2390, contacts: { name: "Lena Ott", email: "lena@example.com" }, ...trip },
      ...over,
    });
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("payment_received"),
      exp_payments: [
        pay({}),
        pay({ id: "pay2", method: "voucher", reference: "NP7-AAAA-BBBB", amount: 200, type: "partial", notes: "Gift voucher" }),
        pay({ id: "old", booking_id: "b-other", created_at: BEFORE }),
        pay({ id: "bank", booking_id: "b-other", method: "bank_transfer", reference: "NP7-XP-3" }),
        pay({ id: "ref", booking_id: "b-other", reference: "re_9", type: "refund", amount: -50 }),
      ],
    });
    await sweepPayments({ since: SINCE });
    expect(state.sent.map((s) => s.dedupeKey)).toEqual([
      "team:payment_received:pay1:simona@np-seven.com",
      "team:payment_received:pay1:experience@np-seven.com",
      "team:payment_received:pay2:simona@np-seven.com",
      "team:payment_received:pay2:experience@np-seven.com",
    ]);
    expect(state.sent[0].vars).toMatchObject({ amount: "€1,195", method: "Bank transfer through Stripe", paymentKind: "Down-payment", guestName: "Lena Ott" });
    // Masked: a voucher with value left can still be spent (review, 28 Sep 2026).
    expect(state.sent[2].vars.method).toBe("Gift voucher …BBBB");
    expect(JSON.stringify(state.sent.map((x) => x.vars))).not.toContain("NP7-AAAA-BBBB");
    // Paid so far comes from the ledger: every received row on the booking.
    expect(state.sent[0].vars.paidSoFar).toBe("€1,395 of €2,390");
    expect(state.sent.every((s) => s.to.endsWith("@np-seven.com"))).toBe(true);

    await sweepPayments({ since: SINCE });
    expect(state.sent).toHaveLength(4);
  });

  it("masks a gift voucher code to its last four", () => {
    expect(methodLabel({ method: "voucher", reference: "NP7-K3QZ-7XWP" })).toBe("Gift voucher …7XWP");
    expect(methodLabel({ method: "voucher", reference: null })).toBe("Gift voucher");
  });

  it("measures a group payer's payments against the whole group, not their own seat", async () => {
    // Review, 28 Sep 2026: the payer's payments carry the group, and
    // "€4,200 of €2,390" read like an overpayment.
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("payment_received").filter((r) => String(r.email).startsWith("simona")),
      exp_payments: [{
        id: "pay1", booking_id: "b1", amount: 4200, type: "downpayment", method: "stripe", reference: "pi_abc",
        notes: "Stripe card", direction: "revenue", status: "paid", created_at: IN,
        exp_bookings: { id: "b1", agreed_price: 2390, contacts: { name: "Lena Ott", email: "lena@example.com" }, ...trip },
      }],
      exp_bookings: [
        { id: "b2", covered_by_booking_id: "b1", agreed_price: 2000, contacts: { name: "Anna Berg" } },
        { id: "b3", covered_by_booking_id: "b1", agreed_price: 1800, contacts: { name: "Tom Berg" } },
      ],
      exp_booking_addons: [],
    });
    await sweepPayments({ since: SINCE });
    expect(state.sent[0].vars.paidSoFar).toBe("€4,200 of €6,190");
  });

  it("leaves the 'of' out when the booking has no price", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("payment_received").filter((r) => String(r.email).startsWith("simona")),
      exp_payments: [{
        id: "pay1", booking_id: "b1", amount: 700, type: "downpayment", method: "stripe", reference: "pi_abc",
        direction: "revenue", status: "paid", created_at: IN,
        exp_bookings: { id: "b1", agreed_price: null, contacts: { name: "Lena Ott" }, ...trip },
      }],
    });
    await sweepPayments({ since: SINCE });
    expect(state.sent[0].vars.paidSoFar).toBe("€700");
  });
});

// ─── transfer_failed ─────────────────────────────────────────────────────────

describe("transfer_failed (from the webhook)", () => {
  const setup = (link: Row) => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("transfer_failed"),
      exp_payment_links: [{ id: "l1", booking_id: "b1", amount: 1440, currency: "EUR", status: "failed", ...link }],
      exp_bookings: [{ id: "b1", contacts: { name: "Lena Ott", email: "lena@example.com" }, ...trip }],
    });
  };

  it("tells the team a payment failed, once", async () => {
    setup({});
    await announceTransferProblem({ kind: "failed", linkId: "l1", bookingId: "b1", reason: "insufficient funds" });
    await announceTransferProblem({ kind: "failed", linkId: "l1", bookingId: "b1", reason: "insufficient funds" });
    expect(state.sent.map((s) => s.dedupeKey)).toEqual([
      "team:transfer_failed:l1:simona@np-seven.com",
      "team:transfer_failed:l1:experience@np-seven.com",
    ]);
    expect(state.sent[0].vars).toMatchObject({ problemTitle: "Payment failed", reason: "insufficient funds", asked: "€1,440" });
    expect(state.sent[0].vars.adminLink).toMatch(/\/admin\/bookings\/b1$/);
  });

  it("says how much is missing on a short transfer, and a second shortfall is a second mail", async () => {
    setup({ status: "part_funded" });
    await announceTransferProblem({ kind: "part_funded", linkId: "l1", bookingId: "b1", receivedCents: 140_000 });
    await announceTransferProblem({ kind: "part_funded", linkId: "l1", bookingId: "b1", receivedCents: 140_000 });
    await announceTransferProblem({ kind: "part_funded", linkId: "l1", bookingId: "b1", receivedCents: 142_000 });
    expect(state.sent).toHaveLength(4);
    expect(state.sent[0].vars).toMatchObject({ problemTitle: "Transfer short", received: "€1,400", short: "€40" });
    expect(state.sent[0].dedupeKey).toBe("team:transfer_failed:l1:part:140000:simona@np-seven.com");
  });

  it("stays quiet about a link that has been paid since, and never throws", async () => {
    setup({ status: "paid" });
    const r = await announceTransferProblem({ kind: "failed", linkId: "l1", bookingId: "b1" });
    expect(r.announced).toBe(0);
    state.db.failOn("team_mail_recipients", "select");
    await expect(announceTransferProblem({ kind: "failed", linkId: "l1" })).resolves.toBeTruthy();
    expect(state.sent).toHaveLength(0);
  });

  it("is called from both webhook branches, inside a try", () => {
    const src = read("src/app/api/webhooks/stripe/route.ts");
    expect(src).toContain('announceTransferProblem({ kind: "part_funded"');
    expect(src).toMatch(/kind: "failed", linkId, bookingId/);
  });
});

// ─── guest_request ───────────────────────────────────────────────────────────

describe("guest_request", () => {
  it("reads back exactly what the route writes, multi-line messages included", () => {
    const line = guestRequestNote({ at: new Date("2026-09-28T09:05:30Z"), from: "Lena Ott", message: "Two extra nights\nand vegan food" });
    expect(line).toBe("[2026-09-28 09:05] EXTRA-NIGHTS / FLIGHT REQUEST from Lena Ott: Two extra nights\nand vegan food");
    const notes = `Website registration\n${line}\n[CANCELLATION REQUESTED 2026-09-28 10:00 by member]`;
    const [req] = guestRequestsIn(notes, SINCE);
    expect(req).toMatchObject({ at: "2026-09-28T09:05:00.000Z", from: "Lena Ott", message: "Two extra nights\nand vegan food" });
    expect(guestRequestsIn(notes, "2026-09-28T09:06:00Z")).toHaveLength(0);
    // Same minute as the window's start: still inside it.
    expect(guestRequestsIn(notes, "2026-09-28T09:05:45Z")).toHaveLength(1);
  });

  it("the route writes the line through the shared builder", () => {
    expect(read("src/app/api/portal/extra-nights/route.ts")).toContain("guestRequestNote({");
  });

  it("announces each request in the window once, and not the old ones", async () => {
    const notes = [
      guestRequestNote({ at: new Date(BEFORE), from: "Lena Ott", message: "old one" }),
      guestRequestNote({ at: new Date(IN), from: "Lena Ott", message: "Can I land a day later?" }),
      guestRequestNote({ at: new Date(IN), from: "Lena Ott", message: "And a vegan option" }),
    ].join("\n");
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("guest_request"),
      exp_bookings: [
        { id: "b1", updated_at: IN, notes, contacts: { name: "Lena Ott", email: "lena@example.com" }, ...trip },
        { id: "b2", updated_at: IN, notes: "Paid by card", contacts: { name: "X" } },
      ],
    });
    await sweepGuestRequests({ since: SINCE });
    await sweepGuestRequests({ since: SINCE });
    expect(state.sent.map((s) => s.vars.message)).toEqual([
      "Can I land a day later?", "Can I land a day later?", "And a vegan option", "And a vegan option",
    ]);
    expect(new Set(state.sent.map((s) => s.dedupeKey)).size).toBe(4);
  });

  it("keeps the same key when staff add a plain line under the request", () => {
    // Review, 28 Sep 2026: the message runs to the next stamped line, so a
    // note typed under it changed a key built from the message text, and the
    // request was mailed again.
    const notes = guestRequestNote({ at: new Date(IN), from: "Lena Ott", message: "Can I land a day later?" });
    const [before] = guestRequestsIn(notes, SINCE);
    const [after] = guestRequestsIn(`${notes}\nCalled her back, flights sorted (Simona)`, SINCE);
    expect(after.key).toBe(before.key);
    // Two requests in the same minute are still two keys.
    const second = guestRequestNote({ at: new Date(IN), from: "Lena Ott", message: "And a vegan option" });
    const two = guestRequestsIn(`${notes}\n${second}`, SINCE);
    expect(two[0].key).toBe(before.key);
    expect(two[1].key).not.toBe(before.key);
  });

  it("does not mail a request again after staff edit the notes", async () => {
    const notes = guestRequestNote({ at: new Date(IN), from: "Lena Ott", message: "Can I land a day later?" });
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("guest_request"),
      exp_bookings: [{ id: "b1", updated_at: IN, notes, contacts: { name: "Lena Ott", email: "lena@example.com" }, ...trip }],
    });
    await sweepGuestRequests({ since: SINCE });
    expect(state.sent).toHaveLength(2);
    Object.assign(state.db.rows("exp_bookings")[0], { notes: `${notes}\nCalled her back`, updated_at: "2026-09-28T10:00:00.000Z" });
    await sweepGuestRequests({ since: SINCE });
    expect(state.sent).toHaveLength(2);
  });
});

// ─── cancellation_requested ──────────────────────────────────────────────────

describe("cancellation_requested", () => {
  it("the route stamps the first request only, and keeps the note", async () => {
    state.user = { contactId: "c1", name: "Lena Ott" };
    state.db = new FakeSupabase({ exp_bookings: [{ id: "b1", contact_id: "c1", notes: null }] });
    const post = () => cancelTrip(
      { json: async () => ({ paid: 700 }) } as unknown as Request,
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect((await post()).status).toBe(200);
    const first = state.db.rows("exp_bookings")[0].cancellation_requested_at;
    expect(first).toBeTruthy();
    await new Promise((r) => setTimeout(r, 5));
    await post();
    const row = state.db.rows("exp_bookings")[0];
    expect(row.cancellation_requested_at).toBe(first);
    expect(String(row.notes)).toMatch(/CANCELLATION REQUESTED .* by member · paid so far: €700/);
  });

  it("announces requests in the window with what has been paid, and skips a booking already lost", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("cancellation_requested"),
      exp_bookings: [
        { id: "b1", status: "confirmed", cancellation_requested_at: IN, contacts: { name: "Lena Ott", email: "lena@example.com" }, ...trip },
        { id: "b2", status: "lost", cancellation_requested_at: IN, contacts: { name: "Gone" } },
        { id: "b3", status: "confirmed", cancellation_requested_at: BEFORE, contacts: { name: "Old" } },
        { id: "b4", status: "confirmed", cancellation_requested_at: null, contacts: { name: "Never asked" } },
      ],
      exp_payments: [
        { booking_id: "b1", amount: 1195, type: "downpayment", direction: "revenue", status: "paid" },
        { booking_id: "b1", amount: 500, type: "final", direction: "revenue", status: "pending" },
      ],
    });
    await sweepCancellationRequests({ since: SINCE });
    expect(state.sent.map((s) => s.bookingId)).toEqual(["b1", "b1"]);
    expect(state.sent[0].vars).toMatchObject({ paidSoFar: "€1,195", bookingStatus: "confirmed" });
    expect(state.sent[0].dedupeKey).toBe(`team:cancellation_requested:b1:${IN}:simona@np-seven.com`);
  });

  it("reminds staff of the real refund rule, in the coded mail and the editable default", () => {
    // Review, 28 Sep 2026: it said passing the place on "costs them nothing"
    // (§ 651e allows the real extra costs) and left out the full-balance and
    // § 651h(3) rules. It now follows cancellation-policy.ts.
    const vars = { guestName: "Lena Ott", experienceTitle: "Bonaire", adminLink: "https://x/admin" };
    const coded = renderTemplate("team_cancellation_requested", vars).html;
    const edited = renderTemplate("team_cancellation_requested", vars, {
      subject_line: DEFAULT_SUBJECTS.team_cancellation_requested,
      body: DEFAULT_BODIES.team_cancellation_requested,
    }).html;
    for (const html of [coded, edited]) {
      expect(html).not.toMatch(/costs? them nothing/i);
      expect(html).toContain("a deposit is refundable while its refund window is open");
      expect(html).toContain("The down-payment is the cancellation fee from the moment it lands");
      expect(html).toContain("once the full balance is paid, that is the fee");
      expect(html).toContain("(§ 651e) is usually cheaper for them: they pay only the real extra costs");
      expect(html).toContain("(§ 651h(3)) mean a full refund");
    }
    expect(DEFAULT_BODIES.team_cancellation_requested).toContain(TEAM_CANCELLATION_REMINDER);
  });
});

// ─── widerruf_received ───────────────────────────────────────────────────────

describe("widerruf_received", () => {
  it("announces new withdrawals in the window, and says whether they were acknowledged", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("widerruf_received"),
      withdrawal_requests: [
        { id: "w1", created_at: IN, name: "Max Muster", contract_ref: "NP7-XP-2026-0041", email: "max@example.com", note: null, status: "new", ack_sent_at: IN },
        { id: "w2", created_at: IN, name: "Done", contract_ref: "x", email: "d@example.com", status: "processed" },
        { id: "w3", created_at: BEFORE, name: "Old", contract_ref: "y", email: "o@example.com", status: "new" },
      ],
    });
    await sweepWiderrufe({ since: SINCE });
    expect(state.sent.map((s) => s.dedupeKey)).toEqual([
      "team:widerruf_received:w1:simona@np-seven.com",
      "team:widerruf_received:w1:experience@np-seven.com",
    ]);
    expect(state.sent[0].vars).toMatchObject({ contractRef: "NP7-XP-2026-0041", ackLine: "They have been sent the confirmation of receipt." });
    expect(state.sent[0].vars.adminLink).toMatch(/\/admin\/widerrufe$/);
  });
});

// ─── account_signup ──────────────────────────────────────────────────────────

describe("account_signup", () => {
  const NOW = Date.parse("2026-09-28T10:00:00Z");
  const contact = (over: Row): Row => ({
    id: "c1", name: "Lena Ott", email: "lena@example.com", source: "website-register",
    created_at: "2026-09-28T09:00:00Z", auth_user_id: "u1", archived_at: null, ...over,
  });

  it("announces website accounts with no booking, fifteen minutes on", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("account_signup"),
      contacts: [
        contact({}),
        contact({ id: "c-booked", email: "b@example.com" }),                       // booked: the booking mail covers it
        contact({ id: "c-fresh", created_at: "2026-09-28T09:50:00Z" }),           // 10 minutes old: next run
        contact({ id: "c-noacct", auth_user_id: null }),                          // no account
        contact({ id: "c-sig", source: "signature-apply" }),                      // its own alert
        contact({ id: "c-group", source: "website-register-group" }),             // a companion
        contact({ id: "c-arch", archived_at: "2026-09-28T09:30:00Z" }),
        contact({ id: "c-old", created_at: BEFORE }),
        contact({ id: "c-typo", email: "someone@gamil.com" }),
      ],
      exp_bookings: [{ id: "b1", contact_id: "c-booked" }],
    });
    await sweepAccountSignups({ since: new Date(NOW - 6 * 3600e3).toISOString(), now: NOW });
    const who = [...new Set(state.sent.map((s) => s.dedupeKey!.split(":")[2]))];
    expect(who).toEqual(["c1", "c-typo"]);
    expect(state.sent[0].vars.typoLine).toBe("");
    expect(state.sent[2].vars.typoLine).toMatch(/did they mean gmail\.com\?/);
  });

  it("says nothing when it cannot tell whether they booked", async () => {
    state.db = new FakeSupabase({ team_mail_recipients: subscribe("account_signup"), contacts: [contact({})] });
    state.db.failOn("exp_bookings", "select");
    const r = await sweepAccountSignups({ now: NOW });
    expect(r.announced).toBe(0);
    expect(r.skipped[0]).toMatch(/unavailable/);
  });

  it("spots the common typo domains", () => {
    expect(likelyTypo("a@gmail.con")).toBe("gmail.com");
    expect(likelyTypo("a@gamil.com")).toBe("gmail.com");
    expect(likelyTypo("a@web.de")).toBeNull();
    expect(likelyTypo("a@firma.cmo")).toBe("firma.com");
  });
});

// ─── signature_application ───────────────────────────────────────────────────

describe("signature_application", () => {
  it("announces only confirmed, new, unarchived applications", async () => {
    const app = (over: Row): Row => ({
      id: "s1", name: "Ines Roth", email: "ines@example.com", verified: true, status: "new", archived_at: null,
      created_at: IN, wants: "Maui", level: "Advanced", media_type: "video", motivation: "I want to learn loops", ...over,
    });
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("signature_application"),
      exp_trip_applications: [
        app({}),
        app({ id: "s-unverified", verified: false }),
        app({ id: "s-seen", status: "shortlisted" }),
        app({ id: "s-arch", archived_at: IN }),
        app({ id: "s-old", created_at: "2026-09-01T00:00:00Z" }),
      ],
    });
    await sweepSignatureApplications({ since: "2026-09-21T00:00:00Z" });
    expect([...new Set(state.sent.map((s) => s.dedupeKey!.split(":")[2]))]).toEqual(["s1"]);
    expect(state.sent[0].vars).toMatchObject({ wants: "Maui", pitch: "Recorded a video pitch" });
  });
});

// ─── review_submitted ────────────────────────────────────────────────────────

describe("review_submitted", () => {
  it("announces guest reviews awaiting approval, and an edit again", async () => {
    const review = (over: Row): Row => ({
      id: "r1", booking_id: "b1", rating: 4, quote: "Best week of my year", author_name: "Lena", status: "pending",
      submitted_at: IN, created_at: IN, exp_experiences: { title: "NP7 Experience Bonaire" }, exp_editions: { label: "Week I" },
      exp_bookings: { contacts: { name: "Lena Ott", email: "lena@example.com" } }, ...over,
    });
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("review_submitted"),
      exp_reviews: [
        review({}),
        review({ id: "r-admin", booking_id: null }),           // typed in the admin
        review({ id: "r-live", status: "approved" }),
        review({ id: "r-old", submitted_at: BEFORE }),
      ],
    });
    await sweepReviews({ since: SINCE });
    expect(state.sent.map((s) => s.dedupeKey)).toEqual([
      `team:review_submitted:r1:${IN}:simona@np-seven.com`,
      `team:review_submitted:r1:${IN}:experience@np-seven.com`,
    ]);
    expect(state.sent[0].vars).toMatchObject({ rating: "★★★★☆ (4 of 5)", editedLine: "" });

    // The guest edits it: new submitted_at, back to pending, a new mail.
    Object.assign(state.db.rows("exp_reviews")[0], { submitted_at: "2026-09-28T11:00:00.000Z" });
    await sweepReviews({ since: SINCE });
    expect(state.sent).toHaveLength(4);
    expect(state.sent[2].vars.editedLine).toBe("They changed a review they had already written.");
  });
});

// ─── hardware ────────────────────────────────────────────────────────────────

describe("hardware alerts", () => {
  it("are quiet while nobody is subscribed", async () => {
    state.db = new FakeSupabase({ team_mail_recipients: [], hw_orders: [{ id: "o1", sales_channel: "web", created_at: IN }] });
    const r = await sweepHwOrders({ since: SINCE });
    expect(r.skipped).toEqual(["nobody is subscribed"]);
    expect(state.sent).toHaveLength(0);
  });

  it("announce web orders, customer returns and new enquiries, as Hardware mail", async () => {
    state.db = new FakeSupabase({
      team_mail_recipients: subscribe("hw_order_placed", "hw_return_requested", "hw_enquiry").filter((r) => String(r.email).startsWith("simona")),
      hw_orders: [
        { id: "o1", display_number: 10001, email: "rider@example.com", currency: "EUR", grand_total: 129900, status: "pending", payment_status: "awaiting", sales_channel: "web", shipping_address: { name: "Rider One", city: "Kiel", country: "DE" }, created_at: IN, archived_at: null, hw_order_lines: [{ title: "Rockstar", variant_title: "107", quantity: 1 }] },
        { id: "o-admin", sales_channel: "admin", created_at: IN, archived_at: null },
        { id: "o-cancel", sales_channel: "web", status: "canceled", created_at: IN, archived_at: null },
      ],
      hw_returns: [
        { id: "ret1", type: "withdrawal", channel: "portal", created_at: IN, declared_at: IN, archived_at: null, hw_orders: { display_number: 10001, email: "rider@example.com" }, hw_return_lines: [{ quantity: 1, reason_code: "too_big", hw_order_lines: { title: "Rockstar", variant_title: "107" } }] },
        { id: "ret-admin", type: "warranty", channel: "admin", created_at: IN, archived_at: null },
      ],
      hw_inquiries: [
        { id: "q1", name: "Kai", email: "kai@example.com", message: "Does it fit a 90 kg rider?", status: "new", product_id: "prod1", created_at: IN, hw_products: { name: "Rockstar" } },
        { id: "q-done", name: "Old", email: "o@example.com", status: "answered", created_at: IN },
      ],
    });
    await sweepHwOrders({ since: SINCE });
    await sweepHwReturns({ since: SINCE });
    await sweepHwEnquiries({ since: SINCE });
    expect(state.sent.map((s) => s.dedupeKey)).toEqual([
      "team:hw_order_placed:o1:simona@np-seven.com",
      "team:hw_return_requested:ret1:simona@np-seven.com",
      "team:hw_enquiry:q1:simona@np-seven.com",
    ]);
    expect(state.sent.every((s) => s.division === "hardware")).toBe(true);
    expect(state.sent[0].vars).toMatchObject({ total: "€1,299.00", items: "1 × Rockstar 107", reference: "NP7-10001", shipTo: "Kiel, DE" });
    expect(state.sent[1].vars).toMatchObject({ returnType: "Withdrawal (Widerruf)", items: "1 × Rockstar 107 · too_big" });
    expect(state.sent[2].vars).toMatchObject({ productName: "Rockstar", message: "Does it fit a 90 kg rider?" });
  });
});

// ─── the registry, the templates, the cron, the seed ─────────────────────────

describe("wiring", () => {
  const NEW_KEYS = [
    "payment_received", "transfer_failed", "guest_request", "cancellation_requested", "widerruf_received",
    "account_signup", "signature_application", "review_submitted", "hw_order_placed", "hw_return_requested", "hw_enquiry",
  ];

  it("every event has a coded template, a default subject and an editable body that render", () => {
    const keys = TEAM_EVENTS.map((e) => e.key as string);
    for (const k of NEW_KEYS) expect(keys).toContain(k);
    for (const e of TEAM_EVENTS) {
      expect(DEFAULT_SUBJECTS[e.templateKey], e.templateKey).toBeTruthy();
      expect(DEFAULT_BODIES[e.templateKey], e.templateKey).toBeTruthy();
      const built = renderTemplate(e.templateKey, { guestName: "Lena Ott", experienceTitle: "Bonaire", adminLink: "https://x/admin" });
      expect(built.subject).toContain("Lena Ott");
      const edited = renderTemplate(
        e.templateKey,
        { guestName: "Lena Ott", problemLine: "Lena Ott's payment did not go through.", adminLink: "https://x/admin" },
        { subject_line: DEFAULT_SUBJECTS[e.templateKey], body: DEFAULT_BODIES[e.templateKey] },
      );
      expect(edited.html).toContain("Lena Ott");
    }
  });

  it("the team copy has no long dashes", () => {
    const copy = [
      ...TEAM_EVENTS.flatMap((e) => [e.title, e.blurb]),
      ...Object.entries(DEFAULT_SUBJECTS).filter(([k]) => k.startsWith("team_")).map(([, v]) => v),
      ...Object.entries(DEFAULT_BODIES).filter(([k]) => k.startsWith("team_")).map(([, v]) => v),
    ];
    for (const t of copy) expect(t, t).not.toMatch(/[\u2013\u2014]/);
    const vars = { guestName: "L", problemLine: "x", botCheck: "b", inviteLine: "i", typoLine: "t", editedLine: "e", ackLine: "a" };
    for (const e of TEAM_EVENTS) {
      const html = renderTemplate(e.templateKey, vars).html;
      const body = html.slice(html.indexOf("<body"));
      expect(body.replace(/<[^>]+>/g, ""), e.templateKey).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("the cron runs every sweep, one after another", () => {
    // The order and the no-overlap rule are pinned by running the route in
    // team-alerts-cron.test.ts; this only checks nothing was dropped.
    const cron = read("src/app/api/cron/team-alerts/route.ts");
    for (const fn of [
      "sweepNewBookings", "sweepAddonRequests", "sweepInterestSignups", "sweepPayments", "sweepGuestRequests",
      "sweepCancellationRequests", "sweepWiderrufe", "sweepAccountSignups", "sweepSignatureApplications",
      "sweepReviews", "sweepHwOrders", "sweepHwReturns", "sweepHwEnquiries",
    ]) expect(cron).toContain(`() => ${fn}(`);
    expect(cron).not.toContain("Promise.all(");
  });

  it("migration 264 seeds Simona and experience@ for events 1 to 8 and nobody for hardware", () => {
    const sql = read("supabase/migrations/20260928_264_team_mail_more_events.sql");
    const values = sql.slice(sql.indexOf("insert into"));
    for (const k of NEW_KEYS.slice(0, 8)) expect(values).toContain(`('${k}')`);
    expect(values).not.toMatch(/\('hw_/);
    expect(values).toContain("'simona@np-seven.com'");
    expect(values).toContain("'experience@np-seven.com'");
    expect(sql).toContain("on conflict do nothing");
    expect(read("supabase/migrations/20260928_265_cancellation_requested.sql")).toContain("add column if not exists cancellation_requested_at timestamptz");
  });

  it("nothing here writes to a guest: every alert goes through mailTeam and team_mail_recipients", () => {
    for (const f of ["src/lib/email/team-alerts-guests.ts", "src/lib/email/team-alerts-hardware.ts"]) {
      const src = read(f);
      expect(src).not.toContain("sendEmail(");
      expect(src).toContain("mailTeam(to,");
    }
  });
});
