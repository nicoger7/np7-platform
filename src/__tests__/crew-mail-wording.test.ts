/**
 * The group-chat mail said "about two months away" whatever day it went out,
 * and promised "your packing list and arrival details follow closer to the
 * trip". Sent to OBX Wind three weeks before the clinic, both were false: it
 * was three weeks, and events get no packing-list or arrival mail.
 */
import { describe, it, expect } from "vitest";
import { renderTemplate, timeAwayPhrase } from "@/lib/email/templates";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");
const TODAY = new Date("2026-09-17T12:00:00Z");

describe("how far away, in words, at send time", () => {
  it("is right on the day it is actually sent", () => {
    expect(timeAwayPhrase("2026-10-10", TODAY)).toBe("about three weeks away"); // OBX, 23 days
    expect(timeAwayPhrase("2026-11-16", TODAY)).toBe("about two months away");  // the ideal 60-day send
    expect(timeAwayPhrase("2026-09-18", TODAY)).toBe("tomorrow");
    expect(timeAwayPhrase("2026-09-24", TODAY)).toBe("about a week away");
    expect(timeAwayPhrase(null, TODAY)).toBe("coming up");
  });
});

describe("the crew mail only promises what will happen", () => {
  const base = { firstName: "Ann", experienceTitle: "NP7 Coaching Clinics USA", dates: "10 Oct – 16 Oct 2026", whatsappLink: "https://chat.whatsapp.com/x", bookingLink: "#" };

  it("a trip guest is told the packing list and arrival details follow", () => {
    const t = text(renderTemplate("crew_forming", { ...base, startDate: "2026-11-16" }).html);
    expect(t).toContain("packing list and arrival details follow");
  });

  it("an event guest is not promised mail that never comes", () => {
    const t = text(renderTemplate("crew_forming", { ...base, startDate: "2026-10-10", event: "yes" }).html);
    expect(t).not.toContain("packing list");
    expect(t).toContain("Just reply to this email");
  });

  it("no send path can hard-code 'two months' any more", () => {
    const t = text(renderTemplate("crew_forming", { ...base, startDate: "2099-01-01" }).html);
    expect(t).not.toContain("two months");
  });
});
