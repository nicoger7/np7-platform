/**
 * Publishing a member's spot without three riders.
 *
 * The rule replaced an online check that was measured and thrown away: every
 * external signal ranked cities above real windsurf spots, so Alexanderplatz
 * beat 23 of the guide's 39 and a PWA World Cup venue had no mapped water within
 * two kilometres. What is left is local evidence only, and the thresholds below
 * were set from the real guide, so the tests use its real numbers.
 *
 * The single most important case in this file is the last one: every failure
 * must HOLD the spot. A database error that released it instead would turn one
 * hiccup into an open publishing endpoint.
 */
import { describe, it, expect } from "vitest";
import {
  canAutoPublish, sigDecimals, normaliseName, similarity, AUTOPUBLISH,
} from "@/lib/spotguide-autopublish";
import { haversineM } from "@/lib/geo";

// Real geometry from the guide.
const SOROBON = { lat: 12.0944, lng: -68.2341 };
const LAC_CAI = { lat: 12.117, lng: -68.22 };
const DEST = "dest-bonaire";
const ME = "contact-me";

/** A stub Supabase whose tables are plain arrays. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeDb(opts: any = {}) {
  const {
    destination = { id: DEST, spotguide_status: "published", lat: 12.15, lng: -68.28 },
    spots = [{ id: "s1", name: "Sorobon", lat: SOROBON.lat, lng: SOROBON.lng, verification: "np7" }],
    bookings = [{ id: "b1", status: "attended", exp_editions: { id: "e1", date_end: "2026-01-20", destination_id: DEST, exp_experiences: { destination_id: DEST } } }],
    mine = [], reversals = [], throwOn = null,
  } = opts;
  const result = (data: unknown) => Promise.resolve({ data, error: null });
  return {
    from(table: string) {
      if (throwOn === table) return chain(Promise.resolve({ data: null, error: new Error("db down") }));
      if (table === "destinations") return chain(result(destination));
      if (table === "spots") return chain(result(opts.spotsQuery === "mine" ? mine : spots), { mineNext: true, mine });
      if (table === "exp_bookings") return chain(result(bookings));
      if (table === "spot_auto_publish") return chain(result(reversals));
      return chain(result([]));
    },
  };
  // Every builder method returns itself; awaiting it yields the row set. `spots`
  // is asked for twice with different filters, so the second call gets `mine`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function chain(p: Promise<any>, o: any = {}): any {
    let usedSubmittedBy = false;
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "is", "limit", "maybeSingle", "order"]) {
      self[m] = (...args: unknown[]) => {
        if (args[0] === "submitted_by") usedSubmittedBy = true;
        return self;
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self.then = (res: any, rej: any) =>
      (usedSubmittedBy && o.mineNext ? Promise.resolve({ data: o.mine, error: null }) : p).then(res, rej);
    return self;
  }
}

const near = (m: number) => ({ lat: SOROBON.lat + m / 111_320, lng: SOROBON.lng });

describe("the helpers the thresholds rest on", () => {
  it("counts only decimals that carry information", () => {
    expect(sigDecimals(12.0944)).toBe(4);
    expect(sigDecimals(12.1)).toBe(1);
    expect(sigDecimals(12.10)).toBe(1); // trailing zero is not precision
    expect(sigDecimals(12)).toBe(0);
  });

  it("compares names the way a person would", () => {
    // The guide's one real duplicate, 952 m apart and spelled two ways.
    expect(similarity(normaliseName("Harbor Wall"), normaliseName("Harbour Wall"))).toBe(1);
    expect(normaliseName("La Tejita & Montaña Roja")).toBe("tejita montana roja");
    // And the trap: strip the shared words and these both collapse to nothing.
    expect(normaliseName("The Bay")).toBe("");
    expect(normaliseName("The Beach")).toBe("");
  });

  it("a neighbouring spot with no name cannot crash the check", () => {
    // It threw a TypeError, which the catch turned into a blanket fail-closed:
    // safe, but it hid every other gate's verdict behind one bad row.
    expect(normaliseName(null)).toBe("");
    expect(normaliseName(undefined)).toBe("");
  });

  it("measures the guide's real distances", () => {
    // Sorobon to Lac Cai, the widest pair that still counts as one bay system.
    expect(Math.round(haversineM(SOROBON, LAC_CAI))).toBeGreaterThan(2500);
    expect(Math.round(haversineM(SOROBON, LAC_CAI))).toBeLessThan(AUTOPUBLISH.ANCHOR_M);
  });
});

describe("a member who was actually there, pinning beside an NP7 spot", () => {
  it("publishes, and says what carried it", async () => {
    const d = await canAutoPublish(fakeDb(), ME, DEST, LAC_CAI, "Lac Cai North", false);
    expect(d.heldBy).toEqual([]);
    expect(d.publish).toBe(true);
    expect(d.evidence?.trip).toMatchObject({ bookingId: "b1" });
    expect((d.evidence?.anchor as { name: string }).name).toBe("Sorobon");
  });
});

describe("what holds it back", () => {
  const cases: [string, Record<string, unknown>, unknown[], string][] = [
    ["never been on a trip there", { bookings: [] }, [LAC_CAI, "Lac Cai North"], "G2_no_trip_at_destination"],
    ["the trip has not happened yet", { bookings: [{ id: "b1", status: "confirmed", exp_editions: { id: "e1", date_end: "2099-01-01", destination_id: DEST, exp_experiences: {} } }] }, [LAC_CAI, "Lac Cai North"], "G2_no_trip_at_destination"],
    ["no NP7-verified spot to anchor to", { spots: [{ id: "s1", name: "Sorobon", lat: SOROBON.lat, lng: SOROBON.lng, verification: "community" }] }, [LAC_CAI, "Lac Cai North"], "G3_no_anchor"],
    ["the destination is still a draft", { destination: { id: DEST, spotguide_status: "draft", lat: 12.15, lng: -68.28 } }, [LAC_CAI, "Lac Cai North"], "G1_dest_not_published"],
    ["this member already had one reversed", { reversals: [{ spot_id: "x" }] }, [LAC_CAI, "Lac Cai North"], "G5_prior_reversal"],
  ];
  it.each(cases)("%s", async (_label, opts, args, gate) => {
    const d = await canAutoPublish(fakeDb(opts), ME, DEST, args[0] as { lat: number; lng: number }, args[1] as string, false);
    expect(d.publish).toBe(false);
    expect(d.heldBy).toContain(gate);
  });

  it("a pin too far from anything NP7 verified", async () => {
    const far = { lat: SOROBON.lat + 0.09, lng: SOROBON.lng }; // ~10 km
    const d = await canAutoPublish(fakeDb(), ME, DEST, far, "Somewhere Else", false);
    expect(d.heldBy).toContain("G3_no_anchor");
  });

  it("a pin on top of a spot that already exists", async () => {
    const d = await canAutoPublish(fakeDb(), ME, DEST, near(100), "Sorobon East", false);
    expect(d.heldBy).toContain("H3_duplicate_distance");
  });

  it("the same spot under another spelling", async () => {
    // 1 km away, so the distance tier is blind to it. Only the name tier sees it.
    const d = await canAutoPublish(fakeDb(), ME, DEST, near(1000), "sorobon", false);
    expect(d.heldBy).toContain("H4_duplicate_name");
    expect(d.heldBy).not.toContain("H3_duplicate_distance");
  });

  it("a pin rounded to a square kilometres wide", async () => {
    const d = await canAutoPublish(fakeDb(), ME, DEST, { lat: 12.1, lng: -68.2 }, "Rough Pin", false);
    expect(d.heldBy).toContain("H1_precision");
  });

  it("a whole new area, which is a whole public page", async () => {
    const d = await canAutoPublish(fakeDb(), ME, DEST, LAC_CAI, "Lac Cai North", true);
    expect(d.heldBy).toEqual(["G0_new_area"]);
  });

  it("no pin at all", async () => {
    const d = await canAutoPublish(fakeDb(), ME, DEST, null, "Nowhere", false);
    expect(d.heldBy).toEqual(["G0_no_coords"]);
  });

  it("null island and whole-degree pins never reach the gates", async () => {
    for (const c of [{ lat: 0, lng: 0 }, { lat: 0.2, lng: -0.3 }]) {
      expect((await canAutoPublish(fakeDb(), ME, DEST, c, "X", false)).heldBy).toEqual(["R2_null_island"]);
    }
    expect((await canAutoPublish(fakeDb(), ME, DEST, { lat: 12, lng: -68 }, "X", false)).heldBy).toEqual(["R3_whole_degree"]);
  });

  it("too many already, at this destination and in total", async () => {
    const recent = new Date().toISOString();
    const two = [
      { id: "m1", name: "Mine One", lat: 12.2, lng: -68.3, verification: "community", destination_id: DEST, created_at: recent },
      { id: "m2", name: "Mine Two", lat: 12.3, lng: -68.4, verification: "community", destination_id: DEST, created_at: recent },
    ];
    const d = await canAutoPublish(fakeDb({ mine: two }), ME, DEST, LAC_CAI, "Lac Cai North", false);
    expect(d.heldBy).toContain("G4_dest_cap");
    expect(d.publish).toBe(false);
  });
});

describe("THE SIGN THAT MUST NEVER BE FLIPPED", () => {
  it.each(["destinations", "spots", "exp_bookings", "spot_auto_publish"])(
    "a failure reading %s holds the spot, it does not release it",
    async (table) => {
      const d = await canAutoPublish(fakeDb({ throwOn: table }), ME, DEST, LAC_CAI, "Lac Cai North", false);
      expect(d.publish).toBe(false);
    },
  );
});
