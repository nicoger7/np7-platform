/**
 * The wording behind every "this will email someone" dialog.
 *
 * Checked here rather than in a browser because the point of the shared module
 * is that one sentence covers every sender. If "Nothing sent, the template is
 * off" ever turns into "Sent", somebody confirming an add-on learns nothing
 * from the screen, which is the exact failure Nico asked us to fix.
 */
import { describe, it, expect } from "vitest";
import {
  audienceReceives,
  recipientLine,
  sentLine,
  silentReason,
  willSend,
  type MailAudience,
} from "@/lib/email/mail-warning";

const daniel: MailAudience = { kind: "person", name: "Daniel Rainham", email: "daniel@example.com" };

describe("recipientLine", () => {
  it("names the person and the address, so a typo can be caught", () => {
    expect(recipientLine(daniel)).toBe("Daniel Rainham · daniel@example.com");
  });

  it("says plainly when there is no address on file", () => {
    // Uwe Baerenz has no email until his birthday, on purpose. Promising him a
    // mail would be a lie the send then fails on.
    expect(recipientLine({ kind: "person", name: "Uwe Baerenz", email: null }))
      .toBe("Uwe Baerenz (no email on file)");
  });

  it("counts a group", () => {
    expect(recipientLine({ kind: "people", count: 12, describe: "secured guests" }))
      .toBe("12 secured guests");
  });

  it("does not dress an empty group up as a send", () => {
    expect(recipientLine({ kind: "people", count: 0, describe: "secured guests" }))
      .toBe("No secured guests qualify right now");
  });

  it("gives the reason when nobody is written to", () => {
    expect(recipientLine({ kind: "none", why: "the template is off" })).toBe("the template is off");
  });
});

describe("willSend", () => {
  it("is true for a reachable person", () => {
    expect(willSend(daniel)).toBe(true);
  });
  it("is false for an empty group, a kind:none, and no audience at all", () => {
    expect(willSend({ kind: "people", count: 0, describe: "guests" })).toBe(false);
    expect(willSend({ kind: "none", why: "nobody qualifies" })).toBe(false);
    expect(willSend(null)).toBe(false);
  });
  it("is true when one of several audiences is reachable", () => {
    // Activating a voucher writes to the buyer, and only sometimes also to the
    // gift recipient.
    expect(willSend([daniel, { kind: "person", name: null, email: null }])).toBe(true);
  });
  it("counts a person with an address but no name", () => {
    expect(audienceReceives({ kind: "person", email: "x@y.z" })).toBe(true);
  });
  it("is false for a named person with no address", () => {
    // Otherwise the panel headed "This sends email" would list somebody it
    // cannot reach, which is the contradiction the module exists to stop.
    expect(willSend({ kind: "person", name: "Uwe Baerenz", email: null })).toBe(false);
  });
});

describe("silentReason", () => {
  it("is null while mail is still leaving", () => {
    expect(silentReason(daniel)).toBeNull();
  });
  it("joins the reasons nothing goes out", () => {
    expect(silentReason([
      { kind: "none", why: "the template is off" },
      { kind: "people", count: 0, describe: "standbys" },
    ])).toBe("the template is off. No standbys qualify right now");
  });
});

describe("sentLine", () => {
  it("names the one person it reached", () => {
    expect(sentLine(1, "Daniel Rainham")).toBe("Sent to Daniel Rainham.");
  });
  it("counts a group", () => {
    expect(sentLine(12, "secured guests")).toBe("Sent to 12 secured guests.");
  });
  it("explains a silent result instead of shrugging", () => {
    expect(sentLine(0, "Daniel Rainham", "the template is off"))
      .toBe("Nothing sent, the template is off.");
  });
  it("still says nothing went when there is no reason to give", () => {
    expect(sentLine(0)).toBe("Nothing sent.");
  });
});
