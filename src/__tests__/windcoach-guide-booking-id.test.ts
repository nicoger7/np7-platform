/**
 * POST /api/windcoach/guide — the booking_id path (design agreed with the
 * wind.coach session, 2026-08-27).
 *
 * Rule: booking_id XOR email, at least one required, booking_id wins when both
 * are present. It exists so wind.coach's send form can be two dropdowns fed by
 * /api/windcoach/trips + /trips/{id}/riders instead of four hand-typed fields —
 * and so wind.coach never has to hold NP7 rider addresses: with a booking_id we
 * resolve the contact's email ourselves.
 *
 * The frozen contract lives in windcoach-guide-webhook.test.ts and must stay
 * green; this file only pins what is NEW.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

type Row = Record<string, unknown>;
const fake = {
  contacts: [] as Row[],
  bookings: [] as Row[],
  guides: [] as Row[],
  reset() { this.contacts = []; this.bookings = []; this.guides = []; },
};

vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "windcoach_guides") {
        return {
          select: () => ({
            eq: (_c: string, v: unknown) => ({
              maybeSingle: async () => ({ data: fake.guides.find((g) => g.idempotency_key === v) ?? null }),
            }),
          }),
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                const stored = { id: `g${fake.guides.length + 1}`, ...row };
                fake.guides.push(stored);
                return { data: stored, error: null };
              },
            }),
          }),
        };
      }
      if (table === "contacts") {
        return {
          select: () => ({
            ilike: async (_c: string, v: string) => ({
              data: fake.contacts.filter((c) => String(c.email).toLowerCase() === String(v).toLowerCase()),
            }),
          }),
        };
      }
      if (table === "exp_bookings") {
        // Two shapes now: .eq().maybeSingle() for the direct booking_id lookup,
        // .in() for the legacy email fan-out.
        return {
          select: () => ({
            eq: (_c: string, v: unknown) => ({
              maybeSingle: async () => ({ data: fake.bookings.find((b) => b.id === v) ?? null }),
            }),
            in: async (_c: string, ids: unknown[]) => ({
              data: fake.bookings.filter((b) => (ids as string[]).includes(b.contact_id as string)),
            }),
          }),
        };
      }
      throw new Error(`fake has no table ${table}`);
    },
  }),
}));

import { POST } from "@/app/api/windcoach/guide/route";

const SECRET = "test-secret-0123456789abcdef";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: "guide_bid_1",
    participant: { email: "rider@example.com", name: "Test Rider" },
    trip: { label: "Alacati 2026", start: "2026-08-17", end: "2026-08-23" },
    guide: {
      focus_points: [
        { key: "1.1.3.2", title: "Harness timing", blocks: [{ kind: "how", text: "Like this." }] },
      ],
    },
    ...overrides,
  };
}

function req(raw: string) {
  const headers = new Headers({
    "content-type": "application/json",
    "x-windcoach-signature": crypto.createHmac("sha256", SECRET).update(raw).digest("hex"),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Request("http://test.local/api/windcoach/guide", { method: "POST", headers, body: raw }) as any;
}

/** The rider the coach picked from /trips/{id}/riders — note NO email travels. */
function seedPickedBooking() {
  fake.contacts.push({ id: "c9", email: "picked@example.com" });
  fake.bookings.push({
    id: "b9", contact_id: "c9", edition_id: "e9",
    contacts: { email: "picked@example.com" },
    exp_editions: { date_start: "2026-08-17", date_end: "2026-08-23" },
  });
}

beforeEach(() => {
  fake.reset();
  process.env.WINDCOACH_WEBHOOK_SECRET = SECRET;
});

describe("POST /api/windcoach/guide — booking_id", () => {
  it("booking_id and NO email -> stored, with the contact's email resolved on our side", async () => {
    seedPickedBooking();
    const raw = JSON.stringify(payload({ booking_id: "b9", participant: { name: "Picked Rider" } }));
    const res = await POST(req(raw));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("stored");
    expect(fake.guides[0].booking_id).toBe("b9");
    expect(fake.guides[0].contact_id).toBe("c9");
    // Never null — the column is not-null and the review queue shows it.
    expect(fake.guides[0].email).toBe("picked@example.com");
  });

  it("booking_id WINS over a contradicting email", async () => {
    seedPickedBooking();
    fake.contacts.push({ id: "cX", email: "someone.else@example.com" });
    fake.bookings.push({ id: "bX", contact_id: "cX", exp_editions: { date_start: "2026-08-17", date_end: "2026-08-23" } });
    const raw = JSON.stringify(payload({ booking_id: "b9", participant: { email: "someone.else@example.com" } }));
    const res = await POST(req(raw));
    expect(res.status).toBe(200);
    expect(fake.guides[0].booking_id).toBe("b9");
  });

  it("neither booking_id nor email -> 422 naming participant.email", async () => {
    const raw = JSON.stringify(payload({ participant: { name: "No Address" } }));
    const res = await POST(req(raw));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("participant.email");
    expect(fake.guides).toHaveLength(0);
  });

  it("unknown booking_id and no email -> 422 naming booking_id, nothing written", async () => {
    const raw = JSON.stringify(payload({ booking_id: "ghost", participant: { name: "X" } }));
    const res = await POST(req(raw));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("booking_id");
    expect(fake.guides).toHaveLength(0);
  });

  it("stale booking_id WITH an email falls back to matching — a guide is never lost", async () => {
    fake.contacts.push({ id: "c1", email: "rider@example.com" });
    fake.bookings.push({
      id: "b1", contact_id: "c1",
      exp_editions: { date_start: "2026-08-17", date_end: "2026-08-23" },
    });
    const raw = JSON.stringify(payload({ booking_id: "deleted-long-ago" }));
    const res = await POST(req(raw));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("stored");
    expect(fake.guides[0].booking_id).toBe("b1");
  });

  it("legacy payload (email only, no booking_id) is untouched", async () => {
    fake.contacts.push({ id: "c1", email: "rider@example.com" });
    fake.bookings.push({
      id: "b1", contact_id: "c1",
      exp_editions: { date_start: "2026-08-17", date_end: "2026-08-23" },
    });
    const res = await POST(req(JSON.stringify(payload())));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("stored");
    expect(fake.guides[0].email).toBe("rider@example.com");
  });
});
