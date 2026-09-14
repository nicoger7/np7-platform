/**
 * The arithmetic on a final invoice, checked against the four real bookings
 * that each broke a previous version of it.
 */
import { describe, it, expect } from "vitest";
import { finalInvoiceFigures } from "@/lib/invoices/final-figures";

describe("a final invoice adds up on the page", () => {
  it("Daniel Rainham: nothing invoiced before, part paid — the balance is what is left", () => {
    const f = finalInvoiceFigures({ agreedPrice: 5790, received: 3010.8, priorInvoiced: 0, amountDue: 5790 });
    expect(f).toEqual({ priorInvoiced: 0, receivedApplied: 3010.8, invoiceAmount: 5790, balance: 2779.2 });
  });

  it("Christian Skodde: the down-payment invoice was paid — deducted once, as an invoice, not again as money", () => {
    const f = finalInvoiceFigures({ agreedPrice: 2990, received: 1495, priorInvoiced: 1495, amountDue: 1495 });
    expect(f.receivedApplied).toBe(0);
    expect(f.balance).toBe(1495);
  });

  it("Uwe Baerenz: paid in full before any invoice existed — the invoice bills the trip, the balance is zero", () => {
    const f = finalInvoiceFigures({ agreedPrice: 5790, received: 5790, priorInvoiced: 0, amountDue: 5790 });
    expect(f.invoiceAmount).toBe(5790);
    expect(f.balance).toBe(0);
  });

  it("an overpayment never prints a negative balance", () => {
    expect(finalInvoiceFigures({ agreedPrice: 750, received: 800, amountDue: 750 }).balance).toBe(0);
  });

  it("without an engine figure it bills the trip less what earlier invoices cover", () => {
    expect(finalInvoiceFigures({ agreedPrice: 3640, received: 1820, priorInvoiced: 1820 })).toMatchObject({ invoiceAmount: 1820, balance: 1820 });
  });
});
