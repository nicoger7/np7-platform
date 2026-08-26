/**
 * @react-pdf/renderer Document builder for invoices and booking confirmations.
 * Returns a <Document> element — call renderToBuffer() on the result.
 *
 * Supports:
 *  - deposit_invoice  (advance payment + remaining balance note)
 *  - final_invoice    (total minus already-invoiced deposit = balance due)
 *  - booking_confirmation (no invoice number, no totals — just a summary doc)
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

import type { CompanySettings, GeneratableType, VatMode } from "./types";
import { formatMoney as formatMoneyRaw } from "./types";

/**
 * Money for the PDF.
 *
 * @react-pdf renders the built-in Helvetica through WinAnsi, where "€" sits in
 * the extended range and is measured too narrow — so "€645.00" printed with the
 * symbol sitting on top of the 6. A plain space after the symbol restores the
 * gap. The minus is the ASCII one for the same reason: U+2212 is outside WinAnsi
 * and vanished entirely, so a deduction row read as a charge.
 */
const formatMoney = (amount: number | null | undefined, currency = "EUR"): string =>
  formatMoneyRaw(amount, currency).replace(/^([^\d\s-]+)(?=\d)/, "$1 ");

// ─── Colour / typography tokens ──────────────────────────────────────────────
const BRAND_DARK = "#00374a";
const BRAND_BLUE = "#00afdb";
const GREY      = "#6a7a80";
const LIGHT_GREY = "#e3e8ea";
const BLACK      = "#1a1a1a";

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: BLACK,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    lineHeight: 1.5,
  },
  // Header row: seller + doc info
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  sellerBlock: { maxWidth: "55%" },
  docInfoBlock: { textAlign: "right", maxWidth: "40%" },
  brandName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND_DARK, marginBottom: 4 },
  smallLabel: { fontSize: 7, color: GREY, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  smallText: { fontSize: 8, color: GREY },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND_BLUE, marginTop: 4, marginBottom: 2 },
  docNumber: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND_DARK },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: LIGHT_GREY, marginVertical: 16 },
  // Buyer block
  buyerRow: { flexDirection: "row", marginBottom: 24 },
  buyerLabel: { width: 100, color: GREY, fontSize: 8 },
  buyerData: { flex: 1 },
  // Line items table
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BRAND_DARK, paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 3 },
  tableRowAlt: { flexDirection: "row", paddingVertical: 3, backgroundColor: "#f5f9fa" },
  col_desc: { flex: 1 },
  col_period: { width: 110 },
  col_amount: { width: 90, textAlign: "right" },
  colHeader: { fontFamily: "Helvetica-Bold", fontSize: 8, color: GREY, letterSpacing: 0.5, textTransform: "uppercase" },
  // Totals
  totalsBox: { marginTop: 12, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 3 },
  totalLabel: { width: 160, textAlign: "right", color: GREY, marginRight: 8 },
  totalValue: { width: 90, textAlign: "right" },
  grandTotalRow: { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderTopColor: BRAND_DARK, paddingTop: 5, marginTop: 3 },
  grandLabel: { width: 160, textAlign: "right", fontFamily: "Helvetica-Bold", color: BRAND_DARK, marginRight: 8 },
  grandValue: { width: 90, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 11, color: BRAND_DARK },
  // VAT note
  vatNote: { marginTop: 10, fontSize: 8, color: GREY, fontStyle: "italic" },
  // Bank details
  bankBox: { marginTop: 20, padding: 10, backgroundColor: "#f0f8fb", borderRadius: 3 },
  bankTitle: { fontFamily: "Helvetica-Bold", fontSize: 8, color: BRAND_DARK, marginBottom: 4 },
  bankRow: { flexDirection: "row", marginBottom: 2 },
  bankLabel: { width: 60, color: GREY, fontSize: 8 },
  bankValue: { flex: 1, fontSize: 8 },
  // Highlighted payment reference (so the customer quotes it on the transfer)
  bankRefBox: { marginTop: 8, padding: 8, backgroundColor: "#fff3da", borderRadius: 3, borderLeftWidth: 3, borderLeftColor: "#e6b873" },
  bankRefLabel: { fontSize: 7, color: GREY, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  bankRefValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BRAND_DARK, letterSpacing: 1 },
  // Footer
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, borderTopWidth: 1, borderTopColor: LIGHT_GREY, paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: GREY },
  // Confirmation
  confTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND_DARK, marginBottom: 6 },
  confSubtitle: { fontSize: 11, color: GREY, marginBottom: 20 },
  detailRow: { flexDirection: "row", marginBottom: 6 },
  detailLabel: { width: 140, fontFamily: "Helvetica-Bold", color: BRAND_DARK, fontSize: 9 },
  detailValue: { flex: 1 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND_DARK, marginBottom: 8, marginTop: 16 },
  noteBox: { marginTop: 20, padding: 10, backgroundColor: "#fff7ec", borderRadius: 3, fontSize: 8, color: GREY, fontStyle: "italic" },
});

// ─── Resolved data object ─────────────────────────────────────────────────────
export type InvoiceData = {
  type: GeneratableType;
  company: CompanySettings;
  invoiceNumber: string | null;
  invoiceDate: string;         // ISO date string
  booking: {
    id: string;
    agreedPrice: number;
    /** Deposit milestone amount (0 when the package has no deposit stage). */
    deposit: number;
    /** Down-payment milestone amount — the interim payment that brings the
     *  paid total up to the configured percentage (default 50%) of the trip. */
    downpayment: number;
    currency: string;
    packageName: string | null;
    /** The package's website-included components ("Web" checkmarks, using their Website text). */
    packageIncludes?: string[] | null;
    notes?: string | null;
    /** Confirmed add-ons billed on top of the package, itemised on the invoice. */
    addons?: { label: string; price: number }[];
    /** Only the add-ons THIS document bills (addon_invoice). */
    billedAddons?: { label: string; price: number }[];
    /** The package alone, i.e. agreedPrice minus the add-ons. */
    packagePrice?: number;
    /** Money actually received. The final balance deducts THIS, not a formula. */
    received?: number;
  };
  contact: {
    name: string | null;
    billingAddress: string | null;
    billingPostalCode: string | null;
    billingCity: string | null;
    billingCountry: string | null;
    email: string | null;
  };
  experience: {
    title: string;
  };
  edition: {
    label: string | null;
    dateStart: string | null;
    dateEnd: string | null;
  } | null;
  /** Pro-forma only: the pay-by date (sign-up + the package's payment window). */
  dueDate?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function servicePeriod(ed: InvoiceData["edition"]): string {
  if (!ed) return "—";
  const s = fmtDateShort(ed.dateStart);
  const e = fmtDateShort(ed.dateEnd);
  if (!ed.dateEnd) return s;
  return `${s} – ${e}`;
}

function buyerAddress(c: InvoiceData["contact"]): string {
  const parts = [
    c.name,
    c.billingAddress,
    [c.billingPostalCode, c.billingCity].filter(Boolean).join(" "),
    c.billingCountry,
  ].filter(Boolean);
  return parts.join("\n");
}

function sellerAddress(co: CompanySettings): string {
  const parts = [
    co.legal_name,
    co.address_line1,
    co.address_line2,
    [co.postal_code, co.city].filter(Boolean).join(" "),
    co.country,
  ].filter(Boolean);
  return parts.join("\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SellerBlock({ company }: { company: CompanySettings }) {
  return (
    <View style={s.sellerBlock}>
      <Text style={s.brandName}>{company.legal_name ?? "NP7 GmbH"}</Text>
      <Text style={s.smallText}>{sellerAddress(company)}</Text>
      {company.email && <Text style={[s.smallText, { marginTop: 4 }]}>{company.email}</Text>}
      {company.phone && <Text style={s.smallText}>{company.phone}</Text>}
      {company.website && <Text style={s.smallText}>{company.website}</Text>}
      <View style={{ marginTop: 6 }}>
        {company.vat_id && <Text style={s.smallText}>VAT ID: {company.vat_id}</Text>}
        {company.tax_number && <Text style={s.smallText}>Tax No: {company.tax_number}</Text>}
        {company.register_info && <Text style={s.smallText}>{company.register_info}</Text>}
        {company.managing_director && <Text style={s.smallText}>Managing Director: {company.managing_director}</Text>}
      </View>
    </View>
  );
}

function DocInfoBlock({ data }: { data: InvoiceData }) {
  const { type, invoiceNumber, invoiceDate, booking, edition } = data;
  const isConfirmation = type === "booking_confirmation";
  const docTitle = isConfirmation
    ? "Booking Confirmation"
    : type === "proforma_invoice"
    ? "Pro-forma Invoice"
    : type === "deposit_invoice"
    ? "Deposit Invoice"
    : type === "downpayment_invoice"
    ? "Down-Payment Invoice"
    : type === "addon_invoice"
    ? "Add-on Invoice"
    : "Final Invoice";

  return (
    <View style={s.docInfoBlock}>
      <Text style={s.docTitle}>{docTitle}</Text>
      {type === "proforma_invoice" && (
        <Text style={s.smallText}>Payment request — not a tax invoice</Text>
      )}
      {!isConfirmation && invoiceNumber && (
        <Text style={s.docNumber}>No. {invoiceNumber}</Text>
      )}
      <View style={{ marginTop: 8 }}>
        <Text style={s.smallText}>Date: {fmtDate(invoiceDate)}</Text>
        {type === "proforma_invoice" && data.dueDate && (
          <Text style={[s.smallText, { fontFamily: "Helvetica-Bold" }]}>Payment due by: {fmtDate(data.dueDate)}</Text>
        )}
        {!isConfirmation && (
          <Text style={s.smallText}>
            Service period: {servicePeriod(edition)}
          </Text>
        )}
        <Text style={[s.smallText, { marginTop: 4 }]}>Booking ref: {booking.id.slice(0, 8).toUpperCase()}</Text>
      </View>
    </View>
  );
}

function BuyerBlock({ contact }: { contact: InvoiceData["contact"] }) {
  return (
    <View style={s.buyerRow}>
      <Text style={s.buyerLabel}>Bill to:</Text>
      <View style={s.buyerData}>
        <Text>{buyerAddress(contact) || contact.name || "—"}</Text>
        {contact.email && <Text style={[s.smallText, { marginTop: 3 }]}>{contact.email}</Text>}
      </View>
    </View>
  );
}

function VatNote({ vatMode, vatRate }: { vatMode: VatMode; vatRate: number | null }) {
  if (vatMode === "margin") {
    return (
      <Text style={s.vatNote}>
        VAT charged under the special scheme for travel agents (Articles 306–310 EU VAT Directive). VAT is not shown separately.
      </Text>
    );
  }
  if (vatRate) {
    return (
      <Text style={s.vatNote}>
        All prices include {vatRate}% VAT.
      </Text>
    );
  }
  return null;
}

function BankDetails({ company, currency, reference }: { company: CompanySettings; currency: string; reference?: string | null }) {
  if (!company.iban && !company.bic) return null;
  return (
    <View style={s.bankBox}>
      <Text style={s.bankTitle}>Bank Transfer Details</Text>
      {reference && (
        <View style={s.bankRefBox}>
          <Text style={s.bankRefLabel}>PLEASE QUOTE THIS PAYMENT REFERENCE</Text>
          <Text style={s.bankRefValue}>{reference}</Text>
        </View>
      )}
      {company.bank_name && (
        <View style={s.bankRow}>
          <Text style={s.bankLabel}>Bank:</Text>
          <Text style={s.bankValue}>{company.bank_name}</Text>
        </View>
      )}
      {company.iban && (
        <View style={s.bankRow}>
          <Text style={s.bankLabel}>IBAN:</Text>
          <Text style={s.bankValue}>{company.iban}</Text>
        </View>
      )}
      {company.bic && (
        <View style={s.bankRow}>
          <Text style={s.bankLabel}>BIC:</Text>
          <Text style={s.bankValue}>{company.bic}</Text>
        </View>
      )}
      <View style={s.bankRow}>
        <Text style={s.bankLabel}>Currency:</Text>
        <Text style={s.bankValue}>{currency}</Text>
      </View>
    </View>
  );
}

function PageFooter({ company, invoiceNumber }: { company: CompanySettings; invoiceNumber: string | null }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        {company.legal_name ?? "NP7 GmbH"}{company.register_info ? ` · ${company.register_info}` : ""}
      </Text>
      <Text style={s.footerText}>
        {invoiceNumber ?? ""}{" "}
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </Text>
    </View>
  );
}

// ─── Line-item tables ────────────────────────────────────────────────────────

/** Pro-forma = payment request for the SECURING payment (deposit if configured,
    else the downpayment). Deliberately shows a single gross amount and no VAT
    breakdown — it is not a tax document; the real invoice follows on payment. */
function ProformaLines({ data }: { data: InvoiceData }) {
  const { booking, company, experience, edition } = data;
  const currency = booking.currency || company.currency;
  const securing = booking.deposit > 0 ? booking.deposit : booking.downpayment;
  const securingLabel = booking.deposit > 0 ? "Deposit" : "Down-Payment";
  const description = [experience.title, edition?.label].filter(Boolean).join(" · ");
  const packageDesc = booking.packageName ? `Package: ${booking.packageName}` : "";
  const remaining = booking.agreedPrice - securing;

  return (
    <View>
      <View style={s.tableHeader}>
        <Text style={[s.colHeader, s.col_desc]}>Description</Text>
        <Text style={[s.colHeader, s.col_period]}>Service period</Text>
        <Text style={[s.colHeader, s.col_amount]}>Amount</Text>
      </View>

      <View style={s.tableRow}>
        <View style={s.col_desc}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{description} – {securingLabel} (secures your spot)</Text>
          {packageDesc ? <Text style={s.smallText}>{packageDesc}</Text> : null}
          {booking.packageIncludes?.length ? <Text style={s.smallText}>Incl. {booking.packageIncludes.join(" · ")}</Text> : null}
        </View>
        <Text style={s.col_period}>{servicePeriod(edition)}</Text>
        <Text style={s.col_amount}>{formatMoney(securing, currency)}</Text>
      </View>

      <View style={s.divider} />

      <View style={s.totalsBox}>
        <View style={s.grandTotalRow}>
          <Text style={s.grandLabel}>Amount due:</Text>
          <Text style={s.grandValue}>{formatMoney(securing, currency)}</Text>
        </View>
      </View>

      <View style={[s.noteBox, { marginTop: 16 }]}>
        <Text>
          This pro-forma invoice is a payment request, not a tax invoice — your official
          invoice follows automatically once your payment has arrived.
          {data.dueDate ? ` Please pay by ${fmtDate(data.dueDate)}, quoting the reference above — after that date we can no longer hold your spot.` : " Please quote the reference above with your transfer."}
          {remaining > 0 ? ` The remaining balance of ${formatMoney(remaining, currency)} is invoiced separately later.` : ""}
        </Text>
      </View>
    </View>
  );
}

function DepositInvoiceLines({ data }: { data: InvoiceData }) {
  const { booking, company, experience, edition } = data;
  const currency = booking.currency || company.currency;
  const isMargin = company.vat_mode === "margin";
  const vatRate = company.vat_rate ?? 0;

  const description = [experience.title, edition?.label].filter(Boolean).join(" · ");
  const packageDesc = booking.packageName ? `Package: ${booking.packageName}` : "";

  // Net / VAT / gross for standard mode
  const depositNet = isMargin ? booking.deposit : booking.deposit / (1 + vatRate / 100);
  const depositVat = isMargin ? 0 : booking.deposit - depositNet;
  const balance = booking.agreedPrice - booking.deposit;

  return (
    <View>
      {/* Table header */}
      <View style={s.tableHeader}>
        <Text style={[s.colHeader, s.col_desc]}>Description</Text>
        <Text style={[s.colHeader, s.col_period]}>Service period</Text>
        <Text style={[s.colHeader, s.col_amount]}>Amount</Text>
      </View>

      {/* Deposit line */}
      <View style={s.tableRow}>
        <View style={s.col_desc}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{description} – Advance Payment (Deposit)</Text>
          {packageDesc ? <Text style={s.smallText}>{packageDesc}</Text> : null}
          {booking.packageIncludes?.length ? <Text style={s.smallText}>Incl. {booking.packageIncludes.join(" · ")}</Text> : null}
        </View>
        <Text style={s.col_period}>{servicePeriod(edition)}</Text>
        <Text style={s.col_amount}>{formatMoney(booking.deposit, currency)}</Text>
      </View>

      <View style={s.divider} />

      {/* Totals */}
      <View style={s.totalsBox}>
        {!isMargin && (
          <>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Net amount:</Text>
              <Text style={s.totalValue}>{formatMoney(depositNet, currency)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>VAT ({vatRate}%):</Text>
              <Text style={s.totalValue}>{formatMoney(depositVat, currency)}</Text>
            </View>
          </>
        )}
        <View style={s.grandTotalRow}>
          <Text style={s.grandLabel}>Amount due (deposit):</Text>
          <Text style={s.grandValue}>{formatMoney(booking.deposit, currency)}</Text>
        </View>
      </View>

      {/* Remaining balance note — only when something is actually left to pay.
          This used to print unconditionally, so a deposit that IS the whole
          price told the customer in writing that a further bill was coming and
          quoted it as EUR 0.00. */}
      <View style={[s.noteBox, { marginTop: 16 }]}>
        <Text>
          {balance > 0
            ? `Note: This invoice covers the deposit only. The remaining balance of ${formatMoney(balance, currency)} will be invoiced separately and is payable by bank transfer before the trip start date.`
            : "Note: This payment settles the booking in full — there is no further balance to pay."}
        </Text>
      </View>
    </View>
  );
}

function DownpaymentInvoiceLines({ data }: { data: InvoiceData }) {
  const { booking, company, experience, edition } = data;
  const currency = booking.currency || company.currency;
  const isMargin = company.vat_mode === "margin";
  const vatRate = company.vat_rate ?? 0;

  const description = [experience.title, edition?.label].filter(Boolean).join(" · ");
  const packageDesc = booking.packageName ? `Package: ${booking.packageName}` : "";

  const downpayment = booking.downpayment;
  const dpNet = isMargin ? downpayment : downpayment / (1 + vatRate / 100);
  const dpVat = isMargin ? 0 : downpayment - dpNet;
  // What's been invoiced before this one, and what's left after it.
  const investedBefore = booking.deposit; // deposit already invoiced (0 when none)
  const remaining = booking.agreedPrice - booking.deposit - downpayment;

  return (
    <View>
      <View style={s.tableHeader}>
        <Text style={[s.colHeader, s.col_desc]}>Description</Text>
        <Text style={[s.colHeader, s.col_period]}>Service period</Text>
        <Text style={[s.colHeader, s.col_amount]}>Amount</Text>
      </View>

      {/* Interim payment line */}
      <View style={s.tableRow}>
        <View style={s.col_desc}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{description} – Interim Payment (Down-Payment)</Text>
          {packageDesc ? <Text style={s.smallText}>{packageDesc}</Text> : null}
          {booking.packageIncludes?.length ? <Text style={s.smallText}>Incl. {booking.packageIncludes.join(" · ")}</Text> : null}
        </View>
        <Text style={s.col_period}>{servicePeriod(edition)}</Text>
        <Text style={s.col_amount}>{formatMoney(downpayment, currency)}</Text>
      </View>

      <View style={s.divider} />

      {/* Totals */}
      <View style={s.totalsBox}>
        {!isMargin && (
          <>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Net amount:</Text>
              <Text style={s.totalValue}>{formatMoney(dpNet, currency)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>VAT ({vatRate}%):</Text>
              <Text style={s.totalValue}>{formatMoney(dpVat, currency)}</Text>
            </View>
          </>
        )}
        <View style={s.grandTotalRow}>
          <Text style={s.grandLabel}>Amount due (interim payment):</Text>
          <Text style={s.grandValue}>{formatMoney(downpayment, currency)}</Text>
        </View>
      </View>

      {/* Remaining balance note */}
      <View style={[s.noteBox, { marginTop: 16 }]}>
        <Text>
          Note: This invoice covers an interim down-payment.
          {investedBefore > 0
            ? ` Together with the deposit of ${formatMoney(investedBefore, currency)} invoiced separately, ${formatMoney(investedBefore + downpayment, currency)} of ${formatMoney(booking.agreedPrice, currency)} is now invoiced.`
            : ` ${formatMoney(downpayment, currency)} of ${formatMoney(booking.agreedPrice, currency)} is now invoiced.`}
          {remaining > 0
            ? ` The remaining balance of ${formatMoney(remaining, currency)} will be invoiced separately and is payable by bank transfer before the trip start date.`
            : " This settles the booking in full — there is no further balance to pay."}
        </Text>
      </View>
    </View>
  );
}

/** Interim invoice over extras added after an earlier invoice — bills ONLY
    the stamped add-on rows; the trip's own payment schedule stays untouched
    and the note says so, so nobody reads this as a surprise final bill. */
function AddonInvoiceLines({ data }: { data: InvoiceData }) {
  const { booking, company, experience, edition } = data;
  const currency = booking.currency || company.currency;
  const isMargin = company.vat_mode === "margin";
  const vatRate = company.vat_rate ?? 0;
  const items = booking.billedAddons ?? [];
  const totalAmt = items.reduce((n, a) => n + a.price, 0);
  const net = isMargin ? totalAmt : totalAmt / (1 + vatRate / 100);
  const vat = isMargin ? 0 : totalAmt - net;
  const remaining = Math.max(0, booking.agreedPrice - (booking.received ?? 0) - totalAmt);

  return (
    <View>
      <View style={s.tableHeader}>
        <Text style={[s.colHeader, s.col_desc]}>Description</Text>
        <Text style={[s.colHeader, s.col_period]}>Service period</Text>
        <Text style={[s.colHeader, s.col_amount]}>Amount</Text>
      </View>
      {items.map((a, i) => (
        <View key={i} style={s.tableRow}>
          <View style={s.col_desc}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{a.label}</Text>
            <Text style={s.smallText}>{[experience.title, edition?.label].filter(Boolean).join(" · ")} — booking extra</Text>
          </View>
          <Text style={s.col_period}>{servicePeriod(edition)}</Text>
          <Text style={s.col_amount}>{formatMoney(a.price, currency)}</Text>
        </View>
      ))}
      <View style={s.divider} />
      <View style={s.totalsBox}>
        {!isMargin && (
          <>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Net amount:</Text>
              <Text style={s.totalValue}>{formatMoney(net, currency)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>VAT ({vatRate}%):</Text>
              <Text style={s.totalValue}>{formatMoney(vat, currency)}</Text>
            </View>
          </>
        )}
        <View style={s.grandTotalRow}>
          <Text style={s.grandLabel}>Amount due (add-ons):</Text>
          <Text style={s.grandValue}>{formatMoney(totalAmt, currency)}</Text>
        </View>
      </View>
      <View style={[s.noteBox, { marginTop: 16 }]}>
        <Text>
          {`Note: This invoice covers extras added to your booking — your payment plan for the trip itself is unchanged.`}
          {remaining > 0 ? ` The remaining trip balance of ${formatMoney(remaining, currency)} will be invoiced separately as scheduled.` : ""}
        </Text>
      </View>
    </View>
  );
}

function FinalInvoiceLines({ data }: { data: InvoiceData }) {
  const { booking, company, experience, edition } = data;
  const currency = booking.currency || company.currency;
  const isMargin = company.vat_mode === "margin";
  const vatRate = company.vat_rate ?? 0;
  /**
   * The balance deducts what we have actually RECEIVED.
   *
   * It used to deduct `deposit + downpayment` — the milestone split, a formula
   * rather than a fact. Andreas Burmeister had paid €3,950 of a €4,595 trip and
   * still owed €645; this printed "Less: down-payment already invoiced
   * €2,297.50 · Balance due €2,297.50" for a down-payment invoice that was
   * never issued and never separately paid. Worse, the document row stored
   * €4,595 for the same invoice, so one invoice carried two numbers and neither
   * was the debt.
   *
   * Received is the only figure that matches the booking page, the reminder
   * email and the guest's bank statement.
   */
  const received = booking.received ?? 0;
  const balance = Math.max(0, booking.agreedPrice - received);
  const addons = booking.addons ?? [];
  // agreedPrice is the whole trip. Show the package on its own line so the
  // add-ons are visible rather than swallowed by a package price €645 too high.
  const packagePrice = booking.packagePrice ?? booking.agreedPrice - addons.reduce((n, a) => n + a.price, 0);

  const description = [experience.title, edition?.label].filter(Boolean).join(" · ");
  const packageDesc = booking.packageName ? `Package: ${booking.packageName}` : "";

  const totalNet = isMargin ? booking.agreedPrice : booking.agreedPrice / (1 + vatRate / 100);
  const advanceNet = isMargin ? received : received / (1 + vatRate / 100);
  const balanceNet = totalNet - advanceNet;
  const balanceVat = isMargin ? 0 : balance - balanceNet;

  return (
    <View>
      <View style={s.tableHeader}>
        <Text style={[s.colHeader, s.col_desc]}>Description</Text>
        <Text style={[s.colHeader, s.col_period]}>Service period</Text>
        <Text style={[s.colHeader, s.col_amount]}>Amount</Text>
      </View>

      {/* Total service line */}
      <View style={s.tableRow}>
        <View style={s.col_desc}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{description}</Text>
          {packageDesc ? <Text style={s.smallText}>{packageDesc}</Text> : null}
          {booking.packageIncludes?.length ? <Text style={s.smallText}>Incl. {booking.packageIncludes.join(" · ")}</Text> : null}
        </View>
        <Text style={s.col_period}>{servicePeriod(edition)}</Text>
        <Text style={s.col_amount}>{formatMoney(packagePrice, currency)}</Text>
      </View>

      {/* Add-ons, itemised. They are part of the total either way — the point is
          that the guest can see what the extra money bought. */}
      {addons.map((a, i) => (
        <View key={`${a.label}-${i}`} style={s.tableRow}>
          <View style={s.col_desc}>
            <Text>{a.label}</Text>
          </View>
          <Text style={s.col_period}> </Text>
          <Text style={s.col_amount}>{formatMoney(a.price, currency)}</Text>
        </View>
      ))}

      {/* What has actually been paid. One deduction, one fact. */}
      {received > 0 && (
        <View style={[s.tableRow, { color: GREY }]}>
          <View style={s.col_desc}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Less: payments received</Text>
            <Text style={s.smallText}>Thank you — already paid on this booking</Text>
          </View>
          <Text style={s.col_period}> </Text>
          <Text style={s.col_amount}>-{formatMoney(received, currency)}</Text>
        </View>
      )}

      <View style={s.divider} />

      {/* Totals */}
      <View style={s.totalsBox}>
        {!isMargin && (
          <>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Net balance:</Text>
              <Text style={s.totalValue}>{formatMoney(balanceNet, currency)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>VAT ({vatRate}%):</Text>
              <Text style={s.totalValue}>{formatMoney(balanceVat, currency)}</Text>
            </View>
          </>
        )}
        <View style={s.grandTotalRow}>
          <Text style={s.grandLabel}>Balance due:</Text>
          <Text style={s.grandValue}>{formatMoney(balance, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Booking Confirmation layout ──────────────────────────────────────────────

function BookingConfirmation({ data }: { data: InvoiceData }) {
  const { company, booking, contact, experience, edition, invoiceDate } = data;
  const currency = booking.currency || company.currency;

  return (
    <View>
      <Text style={s.confTitle}>Booking Confirmation</Text>
      <Text style={s.confSubtitle}>{experience.title}{edition?.label ? ` · ${edition.label}` : ""}</Text>

      <Text style={s.sectionTitle}>Guest</Text>
      {[
        ["Name", contact.name],
        ["Email", contact.email],
        ["Billing address", buyerAddress(contact) || "—"],
      ].map(([label, val]) => (
        <View key={label} style={s.detailRow}>
          <Text style={s.detailLabel}>{label}</Text>
          <Text style={s.detailValue}>{val || "—"}</Text>
        </View>
      ))}

      <Text style={s.sectionTitle}>Trip Details</Text>
      {[
        ["Experience", experience.title],
        ["Edition", edition?.label ?? "—"],
        ["Travel dates", servicePeriod(edition)],
        ["Package", booking.packageName ?? "—"],
        ["Confirmation date", fmtDate(invoiceDate)],
        ["Booking reference", booking.id.slice(0, 8).toUpperCase()],
      ].map(([label, val]) => (
        <View key={label} style={s.detailRow}>
          <Text style={s.detailLabel}>{label}</Text>
          <Text style={s.detailValue}>{val}</Text>
        </View>
      ))}

      <Text style={s.sectionTitle}>Payment Summary</Text>
      {[
        ["Total price", formatMoney(booking.agreedPrice, currency)],
        ["Deposit (advance payment)", formatMoney(booking.deposit, currency)],
        ["Remaining balance", formatMoney(booking.agreedPrice - booking.deposit, currency)],
      ].map(([label, val]) => (
        <View key={label} style={s.detailRow}>
          <Text style={s.detailLabel}>{label}</Text>
          <Text style={s.detailValue}>{val}</Text>
        </View>
      ))}

      {booking.notes && (
        <View style={s.noteBox}>
          <Text>{booking.notes}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Sicherungsschein footer ───────────────────────────────────────────────────

function SicherungsscheinNote({ company }: { company: CompanySettings }) {
  if (!company.sicherungsschein_insurer && !company.sicherungsschein_number) return null;
  return (
    <View style={[s.noteBox, { marginTop: 12 }]}>
      <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Insolvency protection (Sicherungsschein)</Text>
      <Text>
        Insurer: {company.sicherungsschein_insurer ?? "—"}{"\n"}
        Certificate number: {company.sicherungsschein_number ?? "—"}
      </Text>
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build and return a @react-pdf/renderer <Document> element for the given
 * resolved invoice data. Pass the result to renderToBuffer().
 */
export function buildInvoiceDocument(data: InvoiceData): React.ReactElement {
  const { type, company, invoiceNumber } = data;
  const currency = data.booking.currency || company.currency;
  const isConfirmation = type === "booking_confirmation";

  return (
    <Document
      title={isConfirmation ? "Booking Confirmation" : `Invoice ${invoiceNumber ?? ""}`}
      author={company.legal_name ?? "NP7 GmbH"}
      creator="NP7 Platform"
    >
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <SellerBlock company={company} />
          <DocInfoBlock data={data} />
        </View>

        <View style={s.divider} />

        {/* Buyer */}
        {!isConfirmation && <BuyerBlock contact={data.contact} />}

        {/* Content */}
        {type === "proforma_invoice" && <ProformaLines data={data} />}
        {type === "deposit_invoice" && <DepositInvoiceLines data={data} />}
        {type === "downpayment_invoice" && <DownpaymentInvoiceLines data={data} />}
        {type === "final_invoice" && <FinalInvoiceLines data={data} />}
        {type === "addon_invoice" && <AddonInvoiceLines data={data} />}
        {isConfirmation && <BookingConfirmation data={data} />}

        {/* VAT note for TAX invoices only (a pro-forma isn't one) */}
        {!isConfirmation && type !== "proforma_invoice" && (
          <VatNote vatMode={company.vat_mode} vatRate={company.vat_rate} />
        )}

        {/* Bank details for invoices */}
        {!isConfirmation && (
          <BankDetails company={company} currency={currency} reference={invoiceNumber} />
        )}

        {/* Sicherungsschein */}
        <SicherungsscheinNote company={company} />

        {/* Footer text from settings */}
        {company.invoice_footer && (
          <Text style={[s.smallText, { marginTop: 16, color: GREY }]}>
            {company.invoice_footer}
          </Text>
        )}

        {/* Terms URL */}
        {company.terms_url && (
          <Text style={[s.smallText, { marginTop: 4, color: GREY }]}>
            Terms & Conditions: {company.terms_url}
          </Text>
        )}

        {/* Page footer */}
        <PageFooter company={company} invoiceNumber={invoiceNumber} />
      </Page>
    </Document>
  );
}


// ─── Credit note / Stornorechnung ────────────────────────────────────────────

/** A credit note corrects ONE issued tax invoice — full (Storno) or partial. */
export type CreditNoteData = {
  company: CompanySettings;
  /** The credit note's own sequential number (same gapless circle). */
  invoiceNumber: string;
  invoiceDate: string;
  /** The invoice being corrected — a credit note without one is not compliant. */
  original: { number: string; date: string; amount: number };
  /** Positive figure; the document renders it as a credit (negative). */
  amount: number;
  full: boolean;
  reason: string;
  currency: string;
  contact: InvoiceData["contact"];
  experience: { title: string };
  edition: InvoiceData["edition"];
};

export function buildCreditNoteDocument(data: CreditNoteData): React.ReactElement {
  const { company, invoiceNumber, original } = data;
  const currency = data.currency || company.currency;
  const description = [data.experience.title, data.edition?.label].filter(Boolean).join(" · ");

  return (
    <Document
      title={`${data.full ? "Cancellation Invoice" : "Credit Note"} ${invoiceNumber}`}
      author={company.legal_name ?? "NP7 GmbH"}
      creator="NP7 Platform"
    >
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <SellerBlock company={company} />
          <View style={s.docInfoBlock}>
            <Text style={s.docTitle}>{data.full ? "Cancellation Invoice" : "Credit Note"}</Text>
            <Text style={s.smallText}>{data.full ? "Storno / full correction" : "Partial correction (Gutschrift)"}</Text>
            <Text style={s.docNumber}>No. {invoiceNumber}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={s.smallText}>Date: {fmtDate(data.invoiceDate)}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />
        <BuyerBlock contact={data.contact} />

        {/* The legally required anchor: WHICH invoice this corrects. */}
        <Text style={[s.smallText, { marginBottom: 10, fontFamily: "Helvetica-Bold" }]}>
          This document corrects invoice No. {original.number} dated {fmtDate(original.date)}.
        </Text>

        <View style={s.tableHeader}>
          <Text style={[s.colHeader, s.col_desc]}>Description</Text>
          <Text style={[s.colHeader, s.col_period]}>Service period</Text>
          <Text style={[s.colHeader, s.col_amount]}>Amount</Text>
        </View>
        <View style={s.tableRow}>
          <View style={s.col_desc}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {data.full ? "Cancellation" : "Credit"}: {description}
            </Text>
            <Text style={[s.smallText, { marginTop: 2 }]}>Reason: {data.reason}</Text>
          </View>
          <Text style={s.col_period}>{servicePeriod(data.edition)}</Text>
          <Text style={s.col_amount}>−{formatMoney(data.amount, currency)}</Text>
        </View>

        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={[s.totalLabel, { fontFamily: "Helvetica-Bold" }]}>Total credit</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>−{formatMoney(data.amount, currency)}</Text>
          </View>
        </View>

        <VatNote vatMode={company.vat_mode} vatRate={company.vat_rate} />
        <Text style={s.vatNote}>
          No payment is due on this document. Any amount already paid against the
          corrected invoice will be refunded.
        </Text>

        {company.invoice_footer && (
          <Text style={[s.smallText, { marginTop: 16, color: GREY }]}>{company.invoice_footer}</Text>
        )}
        <PageFooter company={company} invoiceNumber={invoiceNumber} />
      </Page>
    </Document>
  );
}
