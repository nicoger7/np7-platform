/**
 * A waiting-list sign-up is a package-less lead. It must reach the team as
 * what it is, and never also as "New booking" (Nico, 27 Sep 2026).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isWeekInterest, WEEK_INTEREST_NOTE } from "@/lib/week-interest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("waiting-list sign-ups", () => {
  it("are recognised by the note the form writes, and only while there is no package", () => {
    expect(isWeekInterest({ package_id: null, notes: WEEK_INTEREST_NOTE })).toBe(true);
    expect(isWeekInterest({ package_id: "pkg", notes: WEEK_INTEREST_NOTE })).toBe(false);
    expect(isWeekInterest({ package_id: null, notes: "Website registration · package: No Hotel" })).toBe(false);
    expect(isWeekInterest({ package_id: null, notes: null })).toBe(false);
  });

  it("the form writes exactly that note", () => {
    expect(read("src/app/api/week-interest/route.ts")).toContain("notes: WEEK_INTEREST_NOTE");
  });

  it("are skipped by the new-booking mail and swept by their own", () => {
    const src = read("src/lib/email/team-alerts.ts");
    expect(src).toMatch(/if \(isWeekInterest\(b\)\) continue;/);
    expect(src).toContain('templateKey: "team_interest_signup"');
    expect(src).toContain('key: "interest_signup"');
    expect(read("src/app/api/cron/team-alerts/route.ts")).toContain("sweepInterestSignups({ since })");
  });

  it("have a coded template and an editable default body", async () => {
    const { TEMPLATES } = await import("@/lib/email/templates").catch(() => ({ TEMPLATES: null }));
    const bodies = read("src/lib/email/default-bodies.ts");
    expect(bodies).toContain("team_interest_signup:");
    expect(read("src/lib/email/templates.ts")).toContain("team_interest_signup: (v, opts) =>");
    void TEMPLATES;
  });
});
