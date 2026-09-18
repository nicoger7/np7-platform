/**
 * OBX Wind is an event, runs seven days (10-16 Oct 2026) and has a WhatsApp
 * group link. The group-chat mail was switched off for every event, so the link
 * was entered and could never be sent, and the Mailing tab had no row for it.
 */
import { describe, it, expect } from "vitest";
import { mailAppliesTo, cronSends } from "@/lib/email/readiness";

describe("which scheduled mails an event gets", () => {
  it("an event with a group chat gets the group-chat mail", () => {
    expect(mailAppliesTo("event", "crew_forming", { whatsappLink: "https://chat.whatsapp.com/x" })).toBe(true);
  });

  it("an event without one is never asked for a link it does not need", () => {
    expect(mailAppliesTo("event", "crew_forming", { whatsappLink: null })).toBe(false);
    expect(mailAppliesTo("event", "crew_forming")).toBe(false);
  });

  it("the rest of the travelled-week series still does not apply to an event", () => {
    const link = { whatsappLink: "https://chat.whatsapp.com/x" };
    for (const k of ["pre_trip_info", "pre_trip_excitement", "pre_trip_final"]) expect(mailAppliesTo("event", k, link)).toBe(false);
  });

  it("the three mails events always had are unchanged", () => {
    for (const k of ["waiver_reminder", "balance_invoice_reminder", "photos_ready"]) expect(mailAppliesTo("event", k)).toBe(true);
  });

  it("a trip is unaffected", () => {
    expect(mailAppliesTo("trip", "crew_forming")).toBe(true);
    expect(mailAppliesTo(null, "pre_trip_final")).toBe(true);
  });

  // The dashboard forecast asks cronSends, not mailAppliesTo. It used to ask
  // neither and listed four trip mails for OBX Wind that never go out.
  it("the nightly job sends an event only the waiver reminder among dated mails", () => {
    for (const k of ["crew_forming", "pre_trip_info", "pre_trip_excitement", "pre_trip_final", "post_trip_thank_you"]) {
      expect(cronSends("event", k)).toBe(false);
    }
    expect(cronSends("event", "waiver_reminder")).toBe(true);
  });

  it("the group-chat mail applies to an event but is by hand only", () => {
    const link = { whatsappLink: "https://chat.whatsapp.com/x" };
    expect(mailAppliesTo("event", "crew_forming", link)).toBe(true);
    expect(cronSends("event", "crew_forming")).toBe(false);
    expect(cronSends("trip", "crew_forming")).toBe(true);
  });
});
