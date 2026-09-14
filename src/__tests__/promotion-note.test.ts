/**
 * The sentence the admin reads after money lands.
 *
 * It is the only place the team learns that a click issued a tax invoice and
 * emailed it to a guest, so it has to say what actually happened: a deduped
 * send is not a send, and a request that was opened and then immediately
 * covered is not still open.
 */
import { describe, it, expect } from "vitest";
import { describePromotion, emptyPromotion, type PromotedInvoice } from "@/lib/invoices/promotion-note";

const invoice = (over: Partial<PromotedInvoice> = {}): PromotedInvoice => ({
  documentId: "doc-1",
  invoiceNumber: "NP7-XP-2026-0053",
  amount: 1820,
  currency: "EUR",
  emailed: true,
  emailedTo: "Daniel Rainham",
  ...over,
});

describe("what the admin is told after money lands", () => {
  it("Daniel Rainham's down payment: the invoice went out and the rest is asked for", () => {
    expect(describePromotion({
      promoted: true,
      documentId: "doc-1",
      invoices: [invoice()],
      balanceRequested: { amount: 1820, currency: "EUR" },
    })).toBe("Invoice NP7-XP-2026-0053 issued and emailed to Daniel Rainham. A new request for €1,820 is open for the balance.");
  });

  it("a second payment write hits the dedupe, so it must not claim a mail went out", () => {
    expect(describePromotion({
      promoted: true,
      invoices: [invoice({ emailed: false, emailedTo: null })],
      balanceRequested: null,
    })).toBe("Invoice NP7-XP-2026-0053 issued. No email went out.");
  });

  it("paid in full: both stages are named, and no balance is claimed to be open", () => {
    expect(describePromotion({
      promoted: true,
      invoices: [invoice(), invoice({ documentId: "doc-2", invoiceNumber: "NP7-XP-2026-0054" })],
      balanceRequested: null,
    })).toBe("Invoices NP7-XP-2026-0053 and NP7-XP-2026-0054 issued and emailed to Daniel Rainham.");
  });

  it("cents survive, so a balance of 1,820.50 is not printed as 1,820", () => {
    expect(describePromotion({
      promoted: true,
      invoices: [invoice()],
      balanceRequested: { amount: 1820.5, currency: "EUR" },
    })).toContain("€1,820.50");
  });

  it("money that only settled an existing invoice says nothing at all", () => {
    expect(describePromotion(emptyPromotion())).toBeNull();
    expect(describePromotion(null)).toBeNull();
  });
});
