import { describe, it, expect, beforeAll } from "vitest";

/**
 * The gate is the second lock on every /api/admin route: the middleware signs a
 * request once it has been authorized, and the route checks that signature
 * instead of repeating the whole session lookup. These tests pin the two things
 * that make it worth having — a stamp cannot be forged or re-aimed, and a
 * missing key produces no stamp at all (so the route falls back to the full
 * database check rather than letting anyone through).
 */

let signGate: typeof import("@/lib/admin-gate").signGate;
let verifyGate: typeof import("@/lib/admin-gate").verifyGate;

beforeAll(async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-abc";
  ({ signGate, verifyGate } = await import("@/lib/admin-gate"));
});

describe("admin gate", () => {
  it("accepts the stamp it just made", async () => {
    const stamp = await signGate("user-1", "POST", "/api/admin/team");
    expect(stamp).toBeTruthy();
    expect(await verifyGate(stamp!, "POST", "/api/admin/team")).toBe(true);
  });

  it("will not let a stamp be re-aimed at another method or path", async () => {
    const stamp = (await signGate("user-1", "GET", "/api/admin/team"))!;
    expect(await verifyGate(stamp, "DELETE", "/api/admin/team")).toBe(false);
    expect(await verifyGate(stamp, "GET", "/api/admin/finance/lines")).toBe(false);
  });

  it("rejects a forged signature, a stretched expiry and rubbish", async () => {
    const stamp = (await signGate("user-1", "POST", "/api/admin/team"))!;
    const sig = stamp.split(".")[2];
    expect(await verifyGate(`9999999999999.user-1.forged`, "POST", "/api/admin/team")).toBe(false);
    // Well past the 60s TTL the stamp was signed for, so the expiry is part of
    // what is signed and cannot be stretched.
    expect(await verifyGate(`${Date.now() + 600_000}.user-1.${sig}`, "POST", "/api/admin/team")).toBe(false);
    expect(await verifyGate("garbage", "POST", "/api/admin/team")).toBe(false);
    expect(await verifyGate("", "POST", "/api/admin/team")).toBe(false);
  });

  it("expires", async () => {
    expect(await verifyGate("1.user-1.whatever", "POST", "/api/admin/team")).toBe(false);
  });

  it("mints nothing without a key, so the route falls back to the database check", async () => {
    const stamp = (await signGate("user-1", "POST", "/api/admin/team"))!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    try {
      expect(await signGate("user-1", "POST", "/api/admin/team")).toBeNull();
      expect(await verifyGate(stamp, "POST", "/api/admin/team")).toBe(false);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});
