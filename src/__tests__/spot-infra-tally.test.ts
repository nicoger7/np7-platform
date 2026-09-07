/**
 * On-site facilities: what the crowd count is allowed to count.
 *
 * The chips a rider sees under "On site" come from `spots.infrastructure`,
 * which NP7 types by hand in admin — "Hotel on site", "Café", things that were
 * never in the shared INFRASTRUCTURE_TAGS vocab. The tally used to be built by
 * mapping over that vocab, so a rider could tap "Café", the confirm would be
 * stored on their row, and the count would render as zero forever: a vote that
 * went nowhere, on the chips most likely to be tapped.
 */
import { describe, it, expect } from "vitest";
import { infraTally, INFRASTRUCTURE_TAGS } from "@/lib/spotguide";

describe("infraTally", () => {
  it("counts a facility NP7 typed by hand, not only the shared vocab", () => {
    expect((INFRASTRUCTURE_TAGS as readonly string[])).not.toContain("Hotel on site");
    const { shares, raters } = infraTally([
      { infrastructure: ["School", "Hotel on site"] },
      { infrastructure: ["Hotel on site"] },
      { infrastructure: ["Hotel on site"] },
    ]);
    expect(raters).toBe(3);
    expect(shares[0]).toEqual({ tag: "Hotel on site", count: 3, pct: 100 });
    expect(shares.find((s) => s.tag === "School")).toEqual({ tag: "School", count: 1, pct: 33 });
  });

  it("ignores members who reported nothing, and facilities nobody confirmed", () => {
    const { shares, raters } = infraTally([{ infrastructure: ["Parking"] }, { infrastructure: [] }, {}]);
    expect(raters).toBe(1);
    expect(shares).toEqual([{ tag: "Parking", count: 1, pct: 100 }]);
  });
});
