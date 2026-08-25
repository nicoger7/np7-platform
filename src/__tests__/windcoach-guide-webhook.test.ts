/**
 * Contract tests for POST /api/windcoach/guide (integration brief §1/§2/§6).
 * The Supabase admin client is faked in-memory, with the idempotency_key
 * UNIQUE constraint enforced like the real table, so the race path is real.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

// ── In-memory fake of the three tables the route touches ────────────────────
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
              maybeSingle: async () => ({
                data: fake.guides.find((g) => g.idempotency_key === v) ?? null,
              }),
            }),
          }),
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                if (fake.guides.some((g) => g.idempotency_key === row.idempotency_key)) {
                  return { data: null, error: { message: 'duplicate key value violates unique constraint "windcoach_guides_idempotency_key_key"' } };
                }
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
              data: fake.contacts.filter(
                (c) => String(c.email).toLowerCase() === String(v).toLowerCase(),
              ),
            }),
          }),
        };
      }
      if (table === "exp_bookings") {
        return {
          select: () => ({
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
    idempotency_key: "guide_test_1",
    participant: { email: "rider@example.com", name: "Test Rider" },
    trip: { label: "Alacati 2026", start: "2026-08-17", end: "2026-08-23" },
    guide: {
      focus_points: [
        {
          key: "1.1.3.2",
          title: "Harness timing",
          summary: "Two sentences for lists.",
          blocks: [
            { kind: "what_to_do", text: "Do the thing." },
            { kind: "how", text: "Like this." },
            { kind: "why", text: "Because." },
            { kind: "common_mistakes", text: "Not that." },
            { kind: "coach_tip", text: "Feel it." },
          ],
          image_urls: [],
        },
      ],
      coach_note: "Good week.",
      generated_at: "2026-08-24T10:00:00Z",
    },
    ...overrides,
  };
}

function sign(raw: string, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

function req(raw: string, sig?: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (sig !== null) headers.set("x-windcoach-signature", sig ?? sign(raw));
  // The handler only uses .text() and .headers — a standard Request suffices.
  return new Request("http://test.local/api/windcoach/guide", {
    method: "POST", headers, body: raw,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

function seedMatchingBooking() {
  fake.contacts.push({ id: "c1", email: "rider@example.com" });
  fake.bookings.push({
    id: "b1", contact_id: "c1", edition_id: "e1",
    exp_editions: { date_start: "2026-08-17", date_end: "2026-08-23" },
  });
}

beforeEach(() => {
  fake.reset();
  process.env.WINDCOACH_WEBHOOK_SECRET = SECRET;
});

describe("POST /api/windcoach/guide", () => {
  it("correct signature and one matching booking -> 200 stored", async () => {
    seedMatchingBooking();
    const raw = JSON.stringify(payload());
    const res = await POST(req(raw));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "stored" });
    expect(fake.guides).toHaveLength(1);
    expect(fake.guides[0].booking_id).toBe("b1");
  });

  it("ONE flipped byte in the body -> 401 and nothing written", async () => {
    seedMatchingBooking();
    const raw = JSON.stringify(payload());
    const sig = sign(raw);
    const tampered = raw.slice(0, -2) + "!" + raw.slice(-1);
    const res = await POST(req(tampered, sig));
    expect(res.status).toBe(401);
    expect(fake.guides).toHaveLength(0);
  });

  it("missing signature header entirely -> 401", async () => {
    const raw = JSON.stringify(payload());
    const res = await POST(req(raw, null));
    expect(res.status).toBe(401);
    expect(fake.guides).toHaveLength(0);
  });

  it("secret not configured -> 401, even with a well-formed request", async () => {
    delete process.env.WINDCOACH_WEBHOOK_SECRET;
    const raw = JSON.stringify(payload());
    const res = await POST(req(raw, sign(raw)));
    expect(res.status).toBe(401);
    expect(fake.guides).toHaveLength(0);
  });

  it("same idempotency_key twice -> first 200, second 409, ONE row", async () => {
    seedMatchingBooking();
    const raw = JSON.stringify(payload());
    const first = await POST(req(raw));
    expect(first.status).toBe(200);
    const second = await POST(req(raw));
    expect(second.status).toBe(409);
    expect(fake.guides).toHaveLength(1);
  });

  it("unknown email -> 200 queued_for_review and a queue row", async () => {
    const raw = JSON.stringify(payload({ participant: { email: "stranger@example.com", name: "S" } }));
    const res = await POST(req(raw));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "queued_for_review" });
    expect(fake.guides).toHaveLength(1);
    expect(fake.guides[0].status).toBe("review");
    expect(fake.guides[0].booking_id).toBeNull();
  });

  it("broken blocks -> 422 that NAMES the field", async () => {
    const p = payload();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.guide as any).focus_points[0].blocks[2] = { kind: "why" }; // text missing
    const raw = JSON.stringify(p);
    const res = await POST(req(raw));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("guide.focus_points[0].blocks[2].text");
    expect(fake.guides).toHaveLength(0);
  });

  it("future payload with pdf_url and filled image_urls -> still 200", async () => {
    seedMatchingBooking();
    const p = payload();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.guide as any).pdf_url = "https://cdn.example.com/guide.pdf";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.guide as any).focus_points[0].image_urls = ["https://cdn.example.com/a.jpg"];
    const raw = JSON.stringify(p);
    const res = await POST(req(raw));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "stored" });
    expect(fake.guides[0].source_pdf_url).toBe("https://cdn.example.com/guide.pdf");
  });
});
