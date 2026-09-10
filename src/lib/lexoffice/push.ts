/**
 * Push one issued NP7 invoice into lexoffice as a Beleg.
 *
 * The division of labour, decided and tested rather than assumed: NP7 writes
 * the invoice and owns the number, lexoffice keeps the books. lexoffice's
 * sales-invoice endpoints answer 406 and its down-payment endpoints 404, and
 * even where creating an invoice works it assigns its own number, which would
 * end the gapless NP7-XP series and leave two competing numbering circles. So
 * the invoice goes across as a voucher carrying OUR number, with the PDF
 * attached, and lexoffice is the Belegarchiv and the Bankbuch.
 *
 * THE PAYMENT IS DELIBERATELY NOT PUSHED. The Beleg stays "noch nicht bezahlt"
 * even when the money has already arrived, because lexoffice's own bank
 * matching finds the transfer by the Belegnummer in the Verwendungszweck and
 * its suggestion engine only searches unpaid vouchers. Marking it paid would
 * hide it from the one mechanism that is supposed to find it. The live API
 * agrees: "paid" is not even an accepted status on create.
 *
 * Ordering matters more than usual here. lexoffice accepts duplicate voucher
 * numbers, has no DELETE for a voucher, and rejects any voucherStatus on
 * update, so a voucher created by mistake can only be removed by hand in the
 * browser. The id is therefore written to the document the instant the create
 * returns, before the PDF is attached: a crash between the two leaves a
 * voucher that a retry finishes rather than a voucher a retry duplicates.
 */

import { createAdminClient } from "@/lib/supabase";
import { classifyTerritory, type VatTerritory } from "./territory";
import { buildRemark, stageLabel } from "./remark";
import {
  createVoucher,
  attachVoucherFile,
  findVoucherByNumber,
  getVoucher,
  type LexVoucherType,
} from "./client";
import { accountForDocument, accountReadiness, apiKeyFor, type LexAccount } from "./accounts";
import { computePaymentPlan, type PackagePaymentConfig, type BookingPaymentState } from "@/lib/payments";
import { bookingBillingTotals, computeDeposit } from "@/lib/invoices/generate";
import { coveredExtraTotal } from "@/lib/group-booking";

/** The document types that represent money owed or given back. Nothing else
    may ever reach lexoffice: a pro-forma is a payment request, a booking
    confirmation confirms a spot, and a Sicherungsschein is an insurance
    certificate. None of them is a Buchhaltungsbeleg, and the accounting plan
    says so in as many words. */
export const PUSHABLE_TYPES = [
  "deposit_invoice",
  "downpayment_invoice",
  "final_invoice",
  "addon_invoice",
  "credit_note",
] as const;

export type PushableType = (typeof PUSHABLE_TYPES)[number];

export type DocumentForPush = {
  id: string;
  booking_id: string | null;
  division: string | null;
  type: string;
  invoice_number: string | null;
  amount: number | null;
  currency: string;
  status: string;
  issued_at: string | null;
  file_path: string | null;
  meta: Record<string, unknown> | null;
  lexoffice_voucher_id: string | null;
  lexoffice_account_id: string | null;
  lexoffice_remark: string | null;
  lexoffice_pushed_at?: string | null;
  lexoffice_error?: string | null;
  lexoffice_attempts: number | null;
};

export type PushOutcome =
  | { ok: true; voucherId: string; remark: string; already: boolean; fileAttached: boolean }
  | { ok: false; blocked: true; reason: string }
  | { ok: false; blocked: false; reason: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── What the Beleg should say ────────────────────────────────────────────────

export type Preview = {
  documentId: string;
  invoiceNumber: string | null;
  type: string;
  amount: number;
  voucherType: LexVoucherType;
  remark: string | null;
  territory: VatTerritory;
  territoryReason: string;
  place: string | null;
  departure: string | null;
  stage: string | null;
  /** Reasons this document must not be pushed at all. */
  blockers: string[];
  /** Things a human should look at before pressing the button. */
  warnings: string[];
  account: LexAccount | null;
};

/**
 * Work out, without touching lexoffice, exactly what would be sent.
 *
 * Everything the admin shows and everything push() sends comes from here, so
 * what a person approves on screen is what actually goes across.
 */
export async function previewPush(doc: DocumentForPush): Promise<Preview> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  if (!(PUSHABLE_TYPES as readonly string[]).includes(doc.type)) {
    blockers.push(
      `A ${doc.type.replace(/_/g, " ")} is not a bookkeeping document. Only real invoices and credit notes belong in lexoffice.`,
    );
  }
  if (doc.status !== "issued") {
    blockers.push(`This document is ${doc.status}, not issued.`);
  }
  if (!doc.invoice_number) {
    blockers.push("This document has no invoice number, and the number is the whole point of the Beleg.");
  }
  if (doc.amount == null) {
    blockers.push("This document has no amount.");
  }
  if (!doc.file_path) {
    warnings.push("There is no stored PDF, so the Beleg would go across without its document attached.");
  }

  /*
   * The Vorprüfung from the accounting plan, in code: an invoice under § 25
   * must not show VAT. If the division is not on the margin scheme then this
   * whole Beleg shape is wrong for it — the description grammar, the zero tax
   * rate and the category all assume § 25. Hardware sells goods at 19% and
   * will need its own rules, so refuse rather than push something that looks
   * right and books wrong.
   */
  const { data: settings } = await db
    .from("company_settings")
    .select("vat_mode, vat_rate")
    .eq("division", doc.division || "experience")
    .maybeSingle();
  if (settings && settings.vat_mode !== "margin") {
    blockers.push(
      `The ${doc.division} division bills at ${settings.vat_rate ?? 19}% VAT, not on the § 25 margin scheme. Pushing it with these rules would book it tax free.`,
    );
  }

  // Trip identity: place, departure, territory.
  let place: string | null = null;
  let departure: string | null = null;
  let territory: VatTerritory = "UNKLAR";
  let territoryReason = "no trip behind this document";
  let stage: string | null = null;

  if (doc.booking_id) {
    const { data: booking } = await db
      .from("exp_bookings")
      .select(
        `id, agreed_price, edition_id, experience_id, covered_by_booking_id,
         exp_editions(label, date_start, kind, deposit, destination_id),
         exp_experiences(title, destination_id),
         exp_packages(deposit, downpayment_percent, final_days_before, deposit_refund_days)`,
      )
      .eq("id", doc.booking_id)
      .maybeSingle();

    if (!booking) {
      blockers.push("The booking behind this document is gone, so the trip cannot be named.");
    } else {
      const ed = booking.exp_editions as { label?: string; date_start?: string; kind?: string; destination_id?: string } | null;
      const ex = booking.exp_experiences as { title?: string; destination_id?: string } | null;
      departure = ed?.date_start ?? null;

      // The edition's own destination wins; otherwise the experience's. That
      // override exists because a clinic series runs the same format in
      // different places.
      const destId = ed?.destination_id ?? ex?.destination_id ?? null;
      if (destId) {
        const { data: dest } = await db
          .from("destinations")
          .select("name, country, region, vat_territory")
          .eq("id", destId)
          .maybeSingle();
        if (dest) {
          place = dest.name ?? null;
          const verdict = classifyTerritory({
            country: dest.country,
            region: dest.region,
            name: dest.name,
            override: dest.vat_territory,
          });
          territory = verdict.territory;
          territoryReason = verdict.reason;
        }
      }
      if (!place) {
        place = ex?.title ?? null;
        if (!destId) {
          territoryReason = "this trip has no destination on file";
        }
      }
      if (!departure) {
        warnings.push(
          "The edition has no start date, so the Beleg cannot say Abreise and two runs of the same trip will look alike.",
        );
      }

      // "Rate n von m" comes from the real payment plan.
      if (doc.type !== "credit_note") {
        try {
          const covered = await coveredExtraTotal(db, booking.id);
          const { total: ownTotal } = await bookingBillingTotals(booking.id, booking.agreed_price ?? 0);
          const pkg = booking.exp_packages as PackagePaymentConfig | null;
          const cfg: PackagePaymentConfig = {
            // Same resolution the invoice generator uses, imported rather than
            // copied: a null deposit means €300, not zero, and a second copy of
            // that rule would eventually disagree with the invoice it describes.
            deposit: computeDeposit({
              exp_editions: booking.exp_editions,
              exp_packages: booking.exp_packages,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any),
            downpayment_percent: pkg?.downpayment_percent ?? null,
            final_days_before: pkg?.final_days_before ?? null,
            deposit_refund_days: pkg?.deposit_refund_days ?? null,
          };
          const state: BookingPaymentState = {
            total: round2(ownTotal + covered),
            editionStart: departure,
          };
          stage = stageLabel(doc.type, computePaymentPlan(cfg, state));
        } catch {
          warnings.push("The payment plan could not be worked out, so the Beleg will not say which instalment this is.");
        }
      }
    }
  } else if (doc.type !== "credit_note") {
    blockers.push("This document is not attached to a booking, so there is no trip to book the margin against.");
  }

  if (territory === "UNKLAR") {
    warnings.push(
      `The EU VAT territory is unclear (${territoryReason}). UNKLAR goes into the Beleg on purpose so the tax practice sees it, but third-country margin is tax free and EU margin is not, so this is worth a ruling.`,
    );
  }

  // A Storno that only gives part of the money back is a judgement call the
  // accounting plan sends to the tax practice by name, alongside vouchers and
  // reverse charge. Flag it; do not quietly book it.
  let reverses: string | null = null;
  if (doc.type === "credit_note") {
    const meta = (doc.meta ?? {}) as { full?: boolean; original_invoice_number?: string };
    reverses = meta.original_invoice_number ?? null;
    if (meta.full === false) {
      warnings.push(
        "This is a partial credit note. Stornos with a partial refund are on the accounting plan's list of things that go to the tax practice rather than being booked straight through.",
      );
    }
  }

  const resolution = await accountForDocument({ division: doc.division, issued_at: doc.issued_at });
  let account: LexAccount | null = null;
  if (!resolution.ok) {
    blockers.push(resolution.reason);
  } else {
    account = resolution.account;
    for (const p of await accountReadiness(account)) blockers.push(p.message);
  }

  const remark =
    doc.invoice_number && place
      ? buildRemark({
          invoiceNumber: doc.invoice_number,
          place,
          departure,
          territory,
          stage,
          reverses,
        })
      : null;
  if (!remark && !blockers.length) {
    blockers.push("The trip could not be named, so the Beschreibung that carries the margin bookkeeping cannot be written.");
  }

  return {
    documentId: doc.id,
    invoiceNumber: doc.invoice_number,
    type: doc.type,
    amount: Math.abs(Number(doc.amount ?? 0)),
    voucherType: doc.type === "credit_note" ? "salescreditnote" : "salesinvoice",
    remark,
    territory,
    territoryReason,
    place,
    departure,
    stage,
    blockers,
    warnings,
    account,
  };
}

// ─── The push ─────────────────────────────────────────────────────────────────

export async function pushDocument(documentId: string): Promise<PushOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: doc, error } = await db.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error || !doc) return { ok: false, blocked: true, reason: "That document does not exist." };

  const d = doc as DocumentForPush;
  const voucherType: LexVoucherType = d.type === "credit_note" ? "salescreditnote" : "salesinvoice";

  const preview = await previewPush(d);
  if (preview.blockers.length) {
    return { ok: false, blocked: true, reason: preview.blockers.join(" ") };
  }
  const account = preview.account!;
  const key = apiKeyFor(account);
  const remark = preview.remark!;

  // ── Idempotency, first half: we already know the voucher ────────────────────
  if (d.lexoffice_voucher_id) {
    const fileAttached = await ensureFileAttached(db, d, key, d.lexoffice_voucher_id);
    return { ok: true, voucherId: d.lexoffice_voucher_id, remark: d.lexoffice_remark ?? remark, already: true, fileAttached };
  }

  /*
   * Idempotency, second half: lexoffice already knows the voucher and we do not.
   *
   * This covers the gap between the create call returning and the id landing on
   * the row: a crash, a rolled-back deploy, a database restored from a moment
   * before the push. Without it that invoice would be pushed again, and since
   * lexoffice accepts a duplicate number and offers no way to delete or void
   * one through the API, the duplicate would sit in the books until somebody
   * removed it by hand.
   */
  const existing = await findVoucherByNumber(key, voucherType, d.invoice_number!);
  if (existing.ok && existing.data) {
    await db
      .from("documents")
      .update({
        lexoffice_voucher_id: existing.data.id,
        lexoffice_account_id: account.id,
        lexoffice_remark: remark,
        lexoffice_pushed_at: new Date().toISOString(),
        lexoffice_error: null,
      })
      .eq("id", d.id);
    const fileAttached = await ensureFileAttached(db, d, key, existing.data.id);
    return { ok: true, voucherId: existing.data.id, remark, already: true, fileAttached };
  }
  if (!existing.ok && !existing.notConfigured) {
    // A lookup that failed for any other reason must stop the push. Creating a
    // voucher without having been able to check for one is how duplicates that
    // cannot be deleted get made.
    await recordFailure(db, d, `Could not check lexoffice for an existing Beleg: ${existing.error}`);
    return { ok: false, blocked: false, reason: `Could not check lexoffice for an existing Beleg: ${existing.error}` };
  }

  const amount = round2(Math.abs(Number(d.amount ?? 0)));
  const issuedDay = (d.issued_at ?? new Date().toISOString()).slice(0, 10);
  const categoryId = (d.type === "credit_note" ? account.credit_category_id : null) ?? account.sales_category_id!;

  const created = await createVoucher(key, {
    type: voucherType,
    // "open" and not "unchecked": a voucher in the zu-prüfen tray is not booked
    // at all, and the accounting plan is explicit that every such voucher has
    // to be cleared before the next Voranmeldung. Open is booked and unpaid,
    // which is the state the bank matcher searches.
    voucherStatus: "open",
    voucherNumber: d.invoice_number!,
    voucherDate: issuedDay,
    totalGrossAmount: amount,
    // Steuersatz "keine". Under § 25 the invoice shows no VAT and the amount is
    // the PDF total, never a base for 19%. The plan spells out what the other
    // way costs: on a €2,990 trip with €2,240 of pre-services the tax is
    // €119.75 on the €750 margin, and 19% of the whole price would be €477.39.
    totalTaxAmount: 0,
    taxType: "gross",
    useCollectiveContact: true,
    remark,
    voucherItems: [{ amount, taxAmount: 0, taxRatePercent: 0, categoryId }],
  });

  if (!created.ok) {
    await recordFailure(db, d, created.error);
    return { ok: false, blocked: false, reason: created.error };
  }

  // Written BEFORE the file is attached, on purpose. See the header.
  const { error: saveErr } = await db
    .from("documents")
    .update({
      lexoffice_voucher_id: created.data.id,
      lexoffice_account_id: account.id,
      lexoffice_remark: remark,
      lexoffice_pushed_at: new Date().toISOString(),
      lexoffice_error: null,
      lexoffice_attempts: (d.lexoffice_attempts ?? 0) + 1,
    })
    .eq("id", d.id);
  if (saveErr) {
    // The voucher exists and we could not write down that it does. Say so
    // loudly: the number is the recovery path, and the next attempt will find
    // it by that number rather than making a second one.
    return {
      ok: false,
      blocked: false,
      reason: `The Beleg was created in lexoffice as ${created.data.id} but could not be recorded here (${saveErr.message}). Retry: it will be found by its number, not duplicated.`,
    };
  }

  const fileAttached = await ensureFileAttached(db, d, key, created.data.id);
  return { ok: true, voucherId: created.data.id, remark, already: false, fileAttached };
}

/**
 * Attach the rendered PDF, unless the voucher already carries a file.
 *
 * Split out so a retry can finish a half-done push. The Beleg is worth much
 * more with the document on it — that is what makes lexoffice the Belegarchiv
 * the tax adviser reads from — but a voucher without its PDF is still a
 * correct booking entry, so a failure here is recorded and not fatal.
 */
async function ensureFileAttached(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  d: DocumentForPush,
  key: string | null,
  voucherId: string,
): Promise<boolean> {
  if (!d.file_path) return false;
  const current = await getVoucher(key, voucherId);
  if (current.ok && (current.data.files ?? []).length > 0) return true;

  const { data: file, error } = await db.storage.from("documents").download(d.file_path);
  if (error || !file) {
    await db.from("documents").update({ lexoffice_error: `Beleg created, but its PDF could not be read from storage: ${error?.message ?? "missing"}` }).eq("id", d.id);
    return false;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = `${(d.invoice_number ?? d.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const res = await attachVoucherFile(key, voucherId, bytes, name);
  if (!res.ok) {
    await db.from("documents").update({ lexoffice_error: `Beleg created, but the PDF did not attach: ${res.error}` }).eq("id", d.id);
    return false;
  }
  await db.from("documents").update({ lexoffice_error: null }).eq("id", d.id);
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordFailure(db: any, d: DocumentForPush, message: string): Promise<void> {
  await db
    .from("documents")
    .update({ lexoffice_error: message, lexoffice_attempts: (d.lexoffice_attempts ?? 0) + 1 })
    .eq("id", d.id);
}
