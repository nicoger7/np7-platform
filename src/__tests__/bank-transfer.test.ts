/**
 * The bank-transfer contract, asserted with no network.
 *
 * Stripe's secret key is not reachable from this machine, so the parameter map
 * and the recorded amount are checked here against the documented contract
 * instead. Two of these assertions are for errors that only ever show up
 * against the live API, which is precisely why they are worth a unit test:
 * naming `customer_email` beside `customer` is a hard Stripe error, and so is
 * naming a payment method type beside a payment_method_configuration.
 */
import { describe, it, expect } from "vitest";
import { bankTransferParams, recordedAmount, feeForMethod, TRANSFER_DUE_DAYS, TRANSFER_SESSION_HOURS, fundsDueBy } from "@/lib/bank-transfer";

describe("the parameters Stripe is handed", () => {
  const p = bankTransferParams({ customer: "cus_123", country: "DE" });

  it("names customer_balance and the eu_bank_transfer funding, key by key", () => {
    expect(p["payment_method_types[0]"]).toBe("customer_balance");
    expect(p["payment_method_options[customer_balance][funding_type]"]).toBe("bank_transfer");
    expect(p["payment_method_options[customer_balance][bank_transfer][type]"]).toBe("eu_bank_transfer");
    expect(p["payment_method_options[customer_balance][bank_transfer][eu_bank_transfer][country]"]).toBe("DE");
  });

  it("carries the Customer, without which the method is simply not available", () => {
    expect(p["customer"]).toBe("cus_123");
  });

  it("never names customer_email: Stripe refuses a session carrying both", () => {
    expect(p).not.toHaveProperty("customer_email");
  });

  it("never names a payment_method_configuration: a named type is the opposite of letting Stripe pick", () => {
    expect(p).not.toHaveProperty("payment_method_configuration");
    expect(Object.keys(p).filter((k) => k.startsWith("payment_method_types["))).toHaveLength(1);
  });

  it("passes the country through for each of the four Stripe localises", () => {
    for (const c of ["DE", "FR", "IE", "NL"] as const) {
      expect(bankTransferParams({ customer: "cus_1", country: c })["payment_method_options[customer_balance][bank_transfer][eu_bank_transfer][country]"]).toBe(c);
    }
  });
});

/**
 * The recorded amount. A €1,440 securing payment throughout, because that is
 * the figure on the booking this was built for.
 */
describe("what gets written down is what arrived", () => {
  it("records the exact amount when the guest typed it exactly", () => {
    expect(recordedAmount({ amountReceivedCents: 144_000, sessionTotalCents: 144_000, feeEur: 0 })).toBe(1440);
  });

  it("records what SHORT-arrived, never what was asked for", () => {
    // A short transfer should never reach this function at all: on
    // customer_balance the intent does not succeed until it is fully funded, so
    // a partial fires payment_intent.partially_funded and writes no payment row
    // anywhere. This asserts the defensive answer if it ever does reach it —
    // 1400, the money that exists, not 1440, the money that does not.
    expect(recordedAmount({ amountReceivedCents: 140_000, sessionTotalCents: 144_000, feeEur: 0 })).toBe(1400);
  });

  it("caps an over-transfer at what the intent received, leaving the surplus where it is", () => {
    // The guest sent €1,500. The intent receives its own €1,440; the extra €60
    // stays in their Stripe cash balance and is not NP7 revenue, so it must not
    // reach exp_payments and inflate the booking.
    expect(recordedAmount({ amountReceivedCents: 144_000, sessionTotalCents: 144_000, feeEur: 0 })).toBe(1440);
  });

  it("falls back to the session total only when the intent could not be read", () => {
    expect(recordedAmount({ amountReceivedCents: null, sessionTotalCents: 144_000, feeEur: 0 })).toBe(1440);
    expect(recordedAmount({ amountReceivedCents: undefined, sessionTotalCents: 144_000, feeEur: 0 })).toBe(1440);
  });

  it("nets the trip's share on a card, where a fee is on the bill", () => {
    // €1,440 + a €46.86 intl card fee charged on top: the trip is still owed
    // exactly 1440, and the fee is never trip revenue.
    expect(recordedAmount({ amountReceivedCents: 148_686, sessionTotalCents: 148_686, feeEur: 46.86 })).toBe(1440);
  });

  it("rounds to the cent rather than leaving float dust on the ledger", () => {
    expect(recordedAmount({ amountReceivedCents: 100_010, sessionTotalCents: 100_010, feeEur: 0.1 })).toBe(1000);
  });
});

/** §270a BGB: no surcharge on a SEPA credit transfer, with no exception to argue. */
describe("a transfer can never carry a fee", () => {
  it("forces zero even when the row somehow says otherwise", () => {
    expect(feeForMethod("transfer", 22.25)).toBe(0);
    expect(feeForMethod("transfer", null)).toBe(0);
  });
  it("leaves a card's fee alone", () => {
    expect(feeForMethod("card", 46.86)).toBe(46.86);
    expect(feeForMethod(null, 46.86)).toBe(46.86);
    expect(feeForMethod("rail", null)).toBe(0);
  });
  it("means a transfer records the full amount that arrived", () => {
    const fee = feeForMethod("transfer", 22.25);
    expect(recordedAmount({ amountReceivedCents: 144_000, sessionTotalCents: 144_000, feeEur: fee })).toBe(1440);
  });
});

describe("the two clocks", () => {
  it("keeps the checkout session inside Stripe's 24-hour cap", () => {
    expect(TRANSFER_SESSION_HOURS).toBeGreaterThan(0);
    expect(TRANSFER_SESSION_HOURS).toBeLessThan(24);
  });
  it("gives the money its own, much longer deadline", () => {
    const since = new Date("2026-09-15T10:00:00Z");
    expect(fundsDueBy(since).toISOString()).toBe(new Date("2026-09-29T10:00:00Z").toISOString());
    expect(TRANSFER_DUE_DAYS * 24).toBeGreaterThan(TRANSFER_SESSION_HOURS);
  });
});
