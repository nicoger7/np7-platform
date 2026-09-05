import { describe, it, expect, beforeAll } from "vitest";

/**
 * The gate is the second lock on every /api/admin route, and since the stamp
 * started carrying the resolved member it is also what lets a route skip
 * re-resolving the caller. These pin the properties that make that safe: a
 * stamp cannot be forged, re-aimed, stretched, or have its PAYLOAD altered
 * without the signature failing, and no key means no stamp at all.
 */

let signGate: typeof import("@/lib/admin-gate").signGate;
let verifyGate: typeof import("@/lib/admin-gate").verifyGate;

const CTX = { userId: "user-1", memberId: "member-9", level: "manager" as const, roleIds: ["r1", "r2"] };

beforeAll(async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-abc";
  ({ signGate, verifyGate } = await import("@/lib/admin-gate"));
});

describe("admin gate", () => {
  it("hands back exactly what was signed", async () => {
    const stamp = await signGate(CTX, "POST", "/api/admin/team");
    expect(stamp).toBeTruthy();
    expect(await verifyGate(stamp!, "POST", "/api/admin/team")).toEqual(CTX);
  });

  it("will not let a stamp be re-aimed at another method or path", async () => {
    const stamp = (await signGate(CTX, "GET", "/api/admin/team"))!;
    expect(await verifyGate(stamp, "DELETE", "/api/admin/team")).toBeNull();
    expect(await verifyGate(stamp, "GET", "/api/admin/finance/lines")).toBeNull();
  });

  it("rejects a stamp whose payload was edited, even with the original signature", async () => {
    const stamp = (await signGate(CTX, "POST", "/api/admin/team"))!;
    const [exp, , sig] = stamp.split(".");
    const owner = Buffer.from(JSON.stringify({ ...CTX, level: "owner" })).toString("base64url");
    expect(await verifyGate(`${exp}.${owner}.${sig}`, "POST", "/api/admin/team")).toBeNull();
  });

  it("rejects a forged signature, a stretched expiry and rubbish", async () => {
    const stamp = (await signGate(CTX, "POST", "/api/admin/team"))!;
    const [, payload, sig] = stamp.split(".");
    expect(await verifyGate(`9999999999999.${payload}.forged`, "POST", "/api/admin/team")).toBeNull();
    expect(await verifyGate(`${Date.now() + 600_000}.${payload}.${sig}`, "POST", "/api/admin/team")).toBeNull();
    expect(await verifyGate("garbage", "POST", "/api/admin/team")).toBeNull();
    expect(await verifyGate("", "POST", "/api/admin/team")).toBeNull();
    expect(await verifyGate("1.x.y", "POST", "/api/admin/team")).toBeNull();
  });

  it("mints nothing without a key, so the route falls back to the database check", async () => {
    const stamp = (await signGate(CTX, "POST", "/api/admin/team"))!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    try {
      expect(await signGate(CTX, "POST", "/api/admin/team")).toBeNull();
      expect(await verifyGate(stamp, "POST", "/api/admin/team")).toBeNull();
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});
