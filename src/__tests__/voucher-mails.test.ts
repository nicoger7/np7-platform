/**
 * The voucher mails (27 Sep 2026).
 *
 *  · voucher_ordered: the buyer's bank details, the moment they order. The
 *    confirmation screen promised this mail and it never existed.
 *  · team_voucher_ordered: the team hears about the order, before the money.
 *  · no recipient mail when Nico is booked to call: he brings the news.
 *  · the gift mails say "voucher" (not "trip"), print the use-by date, and
 *    explain use in the one shared sentence. No long dashes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";
import { VOUCHER_HOW_TO_REDEEM } from "@/lib/vouchers";

type Sent = { to: string; templateKey: string; vars: Record<string, string | undefined>; dedupeKey?: string; manual?: boolean };

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase, sent: [] as Sent[] }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (a: Sent) => {
    state.sent.push(a);
    return { status: "sent" };
  },
}));
vi.mock("@/lib/email/team-alerts", () => ({
  recipientsFor: async (key: string) =>
    key === "voucher_ordered"
      ? [{ id: "r1", event_key: key, email: "Simona@np-seven.com", name: "Simona", enabled: true }, { id: "r2", event_key: key, email: "experience@np-seven.com", name: null, enabled: true }]
      : [],
}));
vi.mock("@/lib/vouchers/voucher-pdf", () => ({ renderVoucherPdf: async () => Buffer.from("pdf") }));

import { sendVoucherIssued, sendVoucherOrdered } from "@/lib/vouchers/notify";
import { renderTemplate } from "@/lib/email/templates";
import { DEFAULT_BODIES, DEFAULT_SUBJECTS } from "@/lib/email/default-bodies";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const voucher = (over: Row = {}): Row => ({
  id: "v1", code: "NP7-AAAA-BBBB", amount: 600, currency: "EUR", status: "active",
  experience_id: null, redeem_by: "2027-09-27", recipient_name: "Anna Berg", recipient_email: "anna@example.com",
  recipient_contact_id: null, message: null, nico_call: false, buyer_contact_id: "c-lena",
  buyer: { name: "Lena Ott", email: "lena@example.com" },
  ...over,
});

beforeEach(() => {
  state.sent = [];
  state.db = new FakeSupabase({ gift_vouchers: [voucher()], company_settings: [{ division: "experience", legal_name: "NP7 GmbH" }] });
});

describe("activation mails", () => {
  it("go to the buyer and the recipient, with the use-by date", async () => {
    const out = await sendVoucherIssued("v1", "https://www.np-seven.com");
    expect(state.sent.map((s) => s.templateKey)).toEqual(["voucher_purchased", "voucher_gift"]);
    expect(state.sent[0].vars.validUntil).toBe("27 September 2027");
    expect(state.sent[1].vars.validUntil).toBe("27 September 2027");
    expect(state.sent[0].vars.experienceTitle).toBe("any NP7 trip");
    expect(out.sentTo).toEqual(["Lena Ott", "Anna Berg"]);
  });

  it("skip the recipient when Nico is booked to call them", async () => {
    state.db = new FakeSupabase({ gift_vouchers: [voucher({ nico_call: true })], company_settings: [] });
    const out = await sendVoucherIssued("v1", "https://www.np-seven.com");
    expect(state.sent.map((s) => s.templateKey)).toEqual(["voucher_purchased"]);
    expect(state.sent[0].vars.nicoCall).toBe("yes");
    expect(out.sentTo).toEqual(["Lena Ott"]);
  });

  it("name what is left on a partly used voucher, not the original amount", async () => {
    state.db = new FakeSupabase({ gift_vouchers: [voucher({ amount: 10000, balance: 7610 })], company_settings: [] });
    await sendVoucherIssued("v1", "https://www.np-seven.com");
    expect(state.sent[0].vars.amount).toBe("€7,610");
  });
});

describe("order mails", () => {
  const order = {
    voucherId: "v9", code: "NP7-CCCC-DDDD", amount: 600, currency: "EUR", buyerName: "Lena Ott", buyerEmail: "lena@example.com",
    buyerContactId: "c-lena", recipientName: "Anna", experienceTitle: null, nicoCall: true, recipientPhone: "+49 170 000", callDate: "12 Oct",
    bank: { legal_name: "NP7 GmbH", iban: "DE00 1234", bic: "QNTODEB2", bank_name: "Qonto" },
  };

  it("send the buyer the bank details, gated like any guest mail (not manual)", async () => {
    await sendVoucherOrdered(order);
    const buyer = state.sent.find((s) => s.templateKey === "voucher_ordered")!;
    expect(buyer.to).toBe("lena@example.com");
    expect(buyer.manual).toBeUndefined();
    expect(buyer.dedupeKey).toBe("voucher_ordered:v9");
    expect(buyer.vars).toMatchObject({ amount: "€600", iban: "DE00 1234", bic: "QNTODEB2", accountHolder: "NP7 GmbH", reference: "NP7-CCCC-DDDD", experienceTitle: "any NP7 trip" });
  });

  it("tell every subscribed team address, internal and deduped per address", async () => {
    const out = await sendVoucherOrdered(order);
    const team = state.sent.filter((s) => s.templateKey === "team_voucher_ordered");
    expect(team.map((s) => s.to)).toEqual(["Simona@np-seven.com", "experience@np-seven.com"]);
    expect(team.every((s) => s.manual === true)).toBe(true);
    expect(team.map((s) => s.dedupeKey)).toEqual(["team:voucher_ordered:v9:simona@np-seven.com", "team:voucher_ordered:v9:experience@np-seven.com"]);
    expect(team[0].vars.callLine).toBe("Nico is to call Anna on +49 170 000, ideally 12 Oct.");
    expect(out).toEqual({ buyer: true, team: 2 });
  });

  it("the buyer mail is on the soft-launch allow-list, like voucher_purchased", () => {
    const src = read("src/lib/email/send.ts");
    const allow = src.slice(src.indexOf("const SOFT_LAUNCH_ALLOWED"), src.indexOf("]);", src.indexOf("const SOFT_LAUNCH_ALLOWED")));
    expect(allow).toContain('"voucher_purchased"');
    expect(allow).toContain('"voucher_ordered"');
  });

  it("the team event is registered with its own template", () => {
    const src = read("src/lib/email/team-alerts.ts");
    expect(src).toContain('key: "voucher_ordered"');
    expect(src).toContain('templateKey: "team_voucher_ordered"');
  });
});

describe("the voucher templates", () => {
  const LONG_DASH = /[–—]/;
  const vars = {
    firstName: "Anna", amount: "€600", experienceTitle: "any NP7 trip", voucherCode: "NP7-AAAA-BBBB", fromName: "Lena Ott",
    validUntil: "27 September 2027", joinLink: "https://www.np-seven.com/experience", recipientName: "Anna",
    iban: "DE00 1234", bic: "QNTODEB2", accountHolder: "NP7 GmbH", reference: "NP7-AAAA-BBBB",
    code: "NP7-AAAA-BBBB", amountLabel: "€600", redeemByLabel: "27 September 2027", browseLink: "https://www.np-seven.com/experience",
    guestName: "Lena Ott", guestEmail: "lena@example.com", adminLink: "https://www.np-seven.com/admin/vouchers",
  };
  const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&amp;/g, "&");

  it("the gift mail says voucher, not trip, and prints the use-by date and how to use it", () => {
    const { subject, html } = renderTemplate("voucher_gift", vars);
    expect(subject).toBe("You've been gifted an NP7 voucher by Lena Ott");
    expect(decode(html)).toContain("valid until <strong>27 September 2027</strong>");
    expect(decode(html)).toContain(VOUCHER_HOW_TO_REDEEM);
    expect(DEFAULT_SUBJECTS.voucher_gift).toBe("You've been gifted an NP7 voucher");
  });

  it("the buyer mail no longer says 'any time'", () => {
    const { html } = renderTemplate("voucher_purchased", vars);
    expect(html).not.toMatch(/any time/);
    expect(decode(html)).toContain("Valid until <strong>27 September 2027</strong>");
    expect(decode(html)).toContain(VOUCHER_HOW_TO_REDEEM);
    expect(DEFAULT_BODIES.voucher_purchased).not.toMatch(/any time/);
  });

  it("the order mail carries the bank details and the reference", () => {
    const { subject, html } = renderTemplate("voucher_ordered", vars);
    expect(subject).toBe("Your NP7 gift voucher order · €600");
    for (const bit of ["DE00 1234", "QNTODEB2", "NP7 GmbH", "NP7-AAAA-BBBB"]) expect(html).toContain(bit);
  });

  it("the reminder explains use the one shared way", () => {
    const { html } = renderTemplate("voucher_expiry_reminder", vars);
    expect(decode(html)).toContain(VOUCHER_HOW_TO_REDEEM);
    expect(html).not.toMatch(/mention the code when you book/);
  });

  it.each(["voucher_gift", "voucher_purchased", "voucher_ordered", "voucher_expiry_reminder", "team_voucher_ordered"])(
    "%s has no long dashes, coded or editable",
    (key) => {
      const { subject, html } = renderTemplate(key, vars);
      expect(subject).not.toMatch(LONG_DASH);
      expect(html).not.toMatch(LONG_DASH);
      expect(DEFAULT_SUBJECTS[key] ?? "").not.toMatch(LONG_DASH);
      expect(DEFAULT_BODIES[key] ?? "").not.toMatch(LONG_DASH);
    },
  );

  it("the reminder cron writes money en-GB, not '1.000 €'", () => {
    const src = read("src/app/api/cron/voucher-expiry/route.ts");
    expect(src).not.toContain('"de-DE"');
    expect(src).toContain("fmtVoucherValue(voucherValueLeft(v)");
  });
});
