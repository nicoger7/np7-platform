/**
 * Hand-typed money meets the feed.
 *
 * Nico, 2026-09-13: "From now on payments can pretty much only be via the bank
 * (with that little back-door)." Three things follow, and this file is them.
 *
 *   ADOPT     A row somebody typed since the NP7 GmbH switch (`unverified`,
 *             28 of them) may be the same euro as a movement the feed has
 *             since imported. Matching it to a NEW payment would count the
 *             money twice, which is the €6,210 story. So the existing row is
 *             adopted ONTO the transaction: it gains the link and the label,
 *             no new row is written, and the movement leaves the "to match"
 *             pile carrying the payment that was already on the booking.
 *
 *   OFF-BANK  Money that will never be in the feed: cash at the centre, a
 *             transfer that went to the old Surfcenter account, an amount
 *             netted against something else. Real, owed, and recorded by a
 *             person, WITH A WRITTEN REASON, which the table refuses to do
 *             without (migration 235). The only way left to add money that
 *             is not a bank movement.
 *
 *   LEGACY    Rows from before the switch are history (migration 239). They
 *             are never offered here, never adopted, never relabelled.
 *
 * Suggestions are pure and computed on read, in the same spirit as match.ts:
 * the amount must agree, and the amount alone never decides.
 */
import { createClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/reconcile";
import { paymentTypeFor } from "./store";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/* Server-only modules, loaded lazily so a script that only wants the pure
   suggestion logic does not pull the PDF stack in. */
async function afterMoneyLanded(bookingId: string | null | undefined) {
  if (!bookingId) return;
  const [{ promoteProformaIfPaid }, { settleInvoices }] = await Promise.all([
    import("@/lib/invoices/promote"),
    import("@/lib/invoices/generate"),
  ]);
  await promoteProformaIfPaid(bookingId).catch((e) =>
    console.warn("[payments] proforma promotion failed (non-fatal):", e instanceof Error ? e.message : e));
  await settleInvoices(bookingId).catch((e) =>
    console.warn("[payments] settle failed (non-fatal):", e instanceof Error ? e.message : e));
}

/** The reference of a booking-to-booking allocation pair. Not money arriving:
 *  the two sides net to zero, so they are never a to-do for the feed. */
export const isAllocationRef = (ref: string | null | undefined) => /^alloc[#:]/.test(ref || "");

// ── Suggesting a transaction for a hand-typed row ────────────────────────────

export type PaymentLike = {
  id: string;
  amount: number | string | null;
  direction: string | null;
  reference: string | null;
  /** The best date the row has: `date`, else received_at, else created_at. */
  on: string | null;
  guestName: string | null;
  invoiceNumber: string | null;
};

export type CreditLike = {
  id: string;
  source: string;
  external_id: string;
  booked_on: string;
  amount: number | string;
  counterparty: string | null;
  reference: string | null;
  label: string | null;
  /** What earlier allocations already took off this movement. */
  allocated?: number;
};

export type AdoptSuggestion = {
  transactionId: string;
  score: number;
  reasons: string[];
  confidence: "exact" | "strong" | "possible";
};

const squash = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const NAME_NOISE = new Set(["MR", "MRS", "MS", "DR", "HERR", "FRAU", "VON", "VAN", "DER", "DEN", "DE", "DA", "GMBH", "BV", "LTD"]);
const nameTokens = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z]+/).filter((t) => t.length >= 3 && !NAME_NOISE.has(t));

function nameOverlap(a: string | null | undefined, b: string | null | undefined): number {
  const x = new Set(nameTokens(a));
  const y = nameTokens(b);
  if (!x.size || !y.length) return 0;
  return y.filter((t) => x.has(t)).length / y.length;
}

const daysBetween = (a: string | null, b: string | null) =>
  a && b ? Math.abs((new Date(a.slice(0, 10)).getTime() - new Date(b.slice(0, 10)).getTime()) / 86_400_000) : null;

/**
 * Which unmatched credits could be this hand-typed payment?
 *
 * The amount has to agree, to the cent, with what the movement still holds:
 * a row that says €2,445 is not the €2,440 that arrived, and the right fix
 * for that is to remove the row and connect the movement from the feed, not
 * to adopt it and let the books disagree with the bank by five euros.
 *
 * Then something has to point at the same PERSON or the same EVENT: the
 * Stripe intent our checkout stamped on the row (`pi_…`) is the transaction's
 * own id; an invoice number typed as the reference appears in the transfer's
 * Verwendungszweck; the payer's name resembles the guest's. Dates help but
 * never decide, and the one exception is the same one match.ts makes: when
 * exactly one credit of this amount exists within a fortnight, that alone is
 * worth saying, as "possible".
 */
export function suggestTransactionsForPayment(payment: PaymentLike, credits: CreditLike[]): AdoptSuggestion[] {
  const amount = round2(Number(payment.amount) || 0);
  if (amount <= 0 || payment.direction === "cost" || isAllocationRef(payment.reference)) return [];

  const ref = squash(payment.reference);
  const inv = squash(payment.invoiceNumber);
  const out: AdoptSuggestion[] = [];
  const sameAmount: CreditLike[] = [];

  for (const t of credits) {
    const held = round2(Number(t.amount) - (t.allocated ?? 0));
    if (held <= 0 || Math.abs(held - amount) > 0.01) continue;
    sameAmount.push(t);

    let score = 0;
    let identified = false;
    let identity = false;
    const reasons: string[] = [];
    const txRef = squash([t.reference, t.label].filter(Boolean).join(" "));
    const ext = squash(t.external_id);

    if (ref && ext && ref.length >= 8 && (ext.includes(ref) || ref.includes(ext))) {
      score += 100; identified = true; identity = true;
      reasons.push(`Same ${t.source === "stripe" ? "Stripe intent" : "bank id"} as the row's reference`);
    } else if (ref && txRef && ref.length >= 6 && txRef.includes(ref)) {
      score += 80; identified = true; identity = true;
      reasons.push(`Transfer quotes ${payment.reference}`);
    }
    if (inv && txRef && inv.length >= 6 && txRef.includes(inv)) {
      score += 70; identified = true; identity = true;
      reasons.push(`Transfer quotes invoice ${payment.invoiceNumber}`);
    }

    const overlap = Math.max(nameOverlap(t.counterparty, payment.guestName), nameOverlap(t.reference, payment.guestName));
    if (overlap >= 0.99) { score += 45; identity = true; reasons.push(`Paid by ${payment.guestName}`); }
    else if (overlap >= 0.5) { score += 28; identity = true; reasons.push(`Payer name resembles ${payment.guestName}`); }

    const gap = daysBetween(t.booked_on, payment.on);
    if (gap != null) {
      if (gap <= 3) { score += 20; reasons.push(gap === 0 ? "Same day" : `${Math.round(gap)} day${gap >= 2 ? "s" : ""} apart`); }
      else if (gap <= 14) { score += 8; reasons.push(`${Math.round(gap)} days apart`); }
      else if (gap > 60) { score -= 15; reasons.push(`${Math.round(gap)} days apart`); }
    }

    if (!identity) continue;
    out.push({ transactionId: t.id, score, reasons, confidence: identified ? "exact" : score >= 60 ? "strong" : "possible" });
  }

  if (!out.length && sameAmount.length === 1) {
    const t = sameAmount[0];
    const gap = daysBetween(t.booked_on, payment.on);
    if (gap != null && gap <= 14) {
      out.push({
        transactionId: t.id, score: 35,
        reasons: ["The only unmatched credit for exactly this amount", `${Math.round(gap)} day${gap === 1 ? "" : "s"} apart`],
        confidence: "possible",
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ── The queue: rows still to decide, each with its best guesses ──────────────

export type QueueRow = {
  id: string;
  amount: number;
  type: string | null;
  direction: string | null;
  status: string | null;
  method: string | null;
  reference: string | null;
  on: string | null;
  notes: string | null;
  booking_id: string | null;
  contact_id: string | null;
  document_id: string | null;
  guestName: string | null;
  invoiceNumber: string | null;
  experienceTitle: string | null;
  /** Why the feed cannot answer this row, when it cannot. */
  note?: string;
  suggestions: (AdoptSuggestion & { transaction: CreditLike })[];
};

/** Unmatched credits the feed still holds money on, newest first. */
export async function loadUnmatchedCredits(division = "experience", limit = 500): Promise<CreditLike[]> {
  const admin = db();
  const { data: txs } = await admin
    .from("bank_transactions")
    .select("id, source, external_id, booked_on, amount, counterparty, reference, label")
    .eq("division", division)
    .is("payment_id", null)
    .is("matched_at", null)
    .is("ignored_at", null)
    .gt("amount", 0)
    .in("kind", ["income", "unknown"])
    .order("booked_on", { ascending: false })
    .limit(limit);
  const rows = (txs ?? []) as CreditLike[];
  if (!rows.length) return [];

  // A partly placed movement holds less than its face value.
  const taken = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 100) {
    const ids = rows.slice(i, i + 100).map((t) => t.id);
    const { data: pays } = await admin.from("exp_payments").select("bank_transaction_id, amount").in("bank_transaction_id", ids);
    for (const p of pays ?? []) {
      const k = String(p.bank_transaction_id);
      taken.set(k, round2((taken.get(k) ?? 0) + (Number(p.amount) || 0)));
    }
  }
  return rows.map((t) => ({ ...t, amount: Number(t.amount), allocated: taken.get(t.id) ?? 0 }));
}

/**
 * The hand-typed rows since the switch that nobody has decided yet, with the
 * feed's best guess beside each. Allocation pairs are left out: they move
 * money between two bookings and are not money arriving.
 */
export async function loadUnverifiedQueue(division = "experience"): Promise<{ rows: QueueRow[]; allocationRows: number }> {
  const admin = db();
  const { data: pays } = await admin
    .from("exp_payments")
    .select("id, amount, type, direction, status, method, reference, date, received_at, created_at, notes, booking_id, contact_id, document_id, experience_id")
    .eq("provenance", "unverified")
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const all = (pays ?? []) as Record<string, unknown>[];
  const allocationRows = all.filter((p) => isAllocationRef(p.reference as string | null)).length;
  const rows = all.filter((p) => !isAllocationRef(p.reference as string | null));
  if (!rows.length) return { rows: [], allocationRows };

  const ids = (k: string) => [...new Set(rows.map((p) => p[k]).filter(Boolean))] as string[];
  const [bookingIds, contactIds, docIds, expIds] = [ids("booking_id"), ids("contact_id"), ids("document_id"), ids("experience_id")];
  const [{ data: bookings }, { data: contacts }, { data: docs }, { data: exps }, credits] = await Promise.all([
    bookingIds.length ? admin.from("exp_bookings").select("id, name, contact_id, experience_id").in("id", bookingIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    contactIds.length ? admin.from("contacts").select("id, name").in("id", contactIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    docIds.length ? admin.from("documents").select("id, invoice_number").in("id", docIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    expIds.length ? admin.from("exp_experiences").select("id, title").in("id", expIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    loadUnmatchedCredits(division),
  ]);
  const bookingById = new Map((bookings ?? []).map((b) => [String(b.id), b]));
  const contactById = new Map((contacts ?? []).map((c) => [String(c.id), String(c.name ?? "")]));
  const docById = new Map((docs ?? []).map((d) => [String(d.id), String(d.invoice_number ?? "")]));
  const expById = new Map((exps ?? []).map((e) => [String(e.id), String(e.title ?? "")]));
  const creditById = new Map(credits.map((c) => [c.id, c]));

  const out: QueueRow[] = rows.map((p) => {
    const booking = p.booking_id ? bookingById.get(String(p.booking_id)) : null;
    const contactId = (p.contact_id as string | null) ?? (booking?.contact_id as string | null) ?? null;
    const guestName = (contactId ? contactById.get(contactId) : null) || (booking?.name as string) || null;
    const experienceId = (p.experience_id as string | null) ?? (booking?.experience_id as string | null) ?? null;
    const like: PaymentLike = {
      id: String(p.id),
      amount: Number(p.amount) || 0,
      direction: (p.direction as string | null) ?? "revenue",
      reference: (p.reference as string | null) ?? null,
      on: ((p.date ?? p.received_at ?? p.created_at) as string | null) ?? null,
      guestName,
      invoiceNumber: p.document_id ? docById.get(String(p.document_id)) ?? null : null,
    };
    const suggestions = suggestTransactionsForPayment(like, credits)
      .map((s) => ({ ...s, transaction: creditById.get(s.transactionId)! }))
      .filter((s) => s.transaction);
    let note: string | undefined;
    if (like.direction === "cost") note = "Money out is placed on a cost line from the feed's Money out side; this row can only be marked off-bank.";
    else if (like.reference?.startsWith("pi_") && !suggestions.length) note = "A Stripe charge. It will appear here once the Stripe feed has synced that intent.";
    else if (!suggestions.length) note = "No unmatched credit holds exactly this amount. If the bank shows a different figure, remove this row and connect the movement from the feed.";
    return {
      id: like.id, amount: Number(like.amount) || 0, type: (p.type as string | null) ?? null, direction: like.direction,
      status: (p.status as string | null) ?? null, method: (p.method as string | null) ?? null, reference: like.reference,
      on: like.on, notes: (p.notes as string | null) ?? null,
      booking_id: (p.booking_id as string | null) ?? null, contact_id: contactId, document_id: (p.document_id as string | null) ?? null,
      guestName, invoiceNumber: like.invoiceNumber,
      experienceTitle: experienceId ? expById.get(experienceId) ?? null : null,
      note, suggestions,
    };
  });
  return { rows: out, allocationRows };
}

// ── Adopting ─────────────────────────────────────────────────────────────────

/**
 * Pure: may this row be adopted onto this movement? The refusals, in the
 * order a person would want to hear them.
 */
export function adoptCheck(opts: {
  payment: { provenance: string | null; bank_transaction_id: string | null; direction: string | null; amount: number | string | null; reference: string | null };
  transaction: { amount: number | string; kind: string; ignored_at: string | null };
  alreadyAllocated: number;
}): { ok: true; remaining: number } | { ok: false; error: string } {
  const p = opts.payment;
  const t = opts.transaction;
  if (p.provenance === "legacy") return { ok: false, error: "That payment is from before this company invoiced. It is history, not something the feed can prove." };
  if (p.bank_transaction_id) return { ok: false, error: "That payment already names a bank movement. Disconnect it there first." };
  if (p.direction === "cost") return { ok: false, error: "Money out is placed on a cost line from the feed, not adopted here." };
  if (isAllocationRef(p.reference)) return { ok: false, error: "That row moves money between two bookings; it is not a payment that arrived." };
  if (t.ignored_at) return { ok: false, error: "That transaction was set aside. Bring it back first." };
  if (Number(t.amount) <= 0) return { ok: false, error: "Money going out cannot be a guest payment." };
  if (t.kind !== "income" && t.kind !== "unknown") return { ok: false, error: `That movement is a ${t.kind === "payout" ? "Stripe payout" : t.kind}, not a guest payment.` };
  const amount = round2(Number(p.amount) || 0);
  if (amount <= 0) return { ok: false, error: "The payment has no positive amount to adopt." };
  const held = round2(Number(t.amount) - opts.alreadyAllocated);
  if (amount > held + 0.01) {
    return { ok: false, error: `The row says €${amount.toFixed(2)} but the movement only holds €${held.toFixed(2)}${opts.alreadyAllocated ? ` (€${opts.alreadyAllocated.toFixed(2)} of it is already placed)` : ""}. Remove the row and connect the movement from the feed instead.` };
  }
  return { ok: true, remaining: round2(held - amount) };
}

/**
 * Adopt an existing payment onto a bank movement. No new money: the row that
 * was already on the booking becomes the booked interpretation of the
 * transaction, gains the link and the `bank` label, and the transaction
 * leaves the pile. Undone by the ordinary "Disconnect" (store.unmatch), which
 * un-ties the row and hands its label back.
 */
export async function adoptTransaction(opts: { paymentId: string; transactionId: string; by: string }):
  Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const admin = db();
  const [{ data: p }, { data: t }] = await Promise.all([
    admin.from("exp_payments").select("id, amount, direction, status, reference, date, received_at, notes, booking_id, document_id, provenance, bank_transaction_id").eq("id", opts.paymentId).maybeSingle(),
    admin.from("bank_transactions").select("*").eq("id", opts.transactionId).maybeSingle(),
  ]);
  if (!p) return { ok: false, error: "No such payment." };
  if (!t) return { ok: false, error: "No such transaction." };

  const { data: existing } = await admin.from("exp_payments").select("id, amount").eq("bank_transaction_id", t.id);
  const already = round2((existing ?? []).reduce((n, r) => n + (Number(r.amount) || 0), 0));
  const verdict = adoptCheck({ payment: p, transaction: t, alreadyAllocated: already });
  if (!verdict.ok) return verdict;

  const stamp = `Adopted onto ${t.source}:${t.external_id} on ${new Date().toISOString().slice(0, 10)}`;
  const { error: payErr } = await admin
    .from("exp_payments")
    .update({
      bank_transaction_id: t.id,
      provenance: "bank",
      unmatched: false,
      // The bank proves it arrived, whatever the row said. Dates the person
      // typed stay; only a missing one is filled from the movement.
      status: "paid",
      method: t.source === "stripe" ? "stripe" : "bank_transfer",
      date: p.date ?? t.booked_on,
      received_at: p.received_at ?? t.executed_at ?? `${t.booked_on}T12:00:00Z`,
      notes: p.notes ? `${p.notes} · ${stamp}` : stamp,
    })
    .eq("id", p.id);
  if (payErr) return { ok: false, error: `Adopting the payment: ${payErr.message}` };

  const fully = verdict.remaining <= 0.01;
  const sole = fully && !already;
  const { error: txErr } = await admin
    .from("bank_transactions")
    .update({
      payment_id: sole ? p.id : null,
      document_id: sole ? p.document_id ?? null : null,
      matched_at: fully ? new Date().toISOString() : null,
      matched_by: opts.by,
      match_confidence: "manual",
    })
    .eq("id", t.id);
  if (txErr) return { ok: false, error: `Linking the transaction: ${txErr.message}` };

  await afterMoneyLanded(p.booking_id as string | null);
  return { ok: true, remaining: verdict.remaining };
}

// ── Off-bank ─────────────────────────────────────────────────────────────────

export const OFF_BANK_METHODS = [
  { key: "cash", label: "Cash", blurb: "Paid in hand, at the centre or in person." },
  { key: "surfcenter", label: "Wired to Surfcenter", blurb: "Landed on the old Surfcenter Experience account, not NP7's." },
  { key: "offset", label: "Offset", blurb: "Netted against something we owed them, or a credit they held." },
  { key: "other", label: "Other", blurb: "Anything else the feed will never show. Say what in the reason." },
] as const;
export type OffBankMethod = (typeof OFF_BANK_METHODS)[number]["key"];

export const isOffBankMethod = (v: unknown): v is OffBankMethod => OFF_BANK_METHODS.some((m) => m.key === v);

export type OffBankInput = {
  bookingId?: string | null;
  documentId?: string | null;
  amount: unknown;
  /** YYYY-MM-DD. Today when missing. */
  date?: unknown;
  method: unknown;
  reason: unknown;
  refund?: unknown;
  notes?: unknown;
};

export type OffBankRow = {
  bookingId: string | null;
  documentId: string | null;
  amount: number;
  date: string;
  method: OffBankMethod;
  reason: string;
  refund: boolean;
  notes: string | null;
};

/** Pure. What the back-door accepts, and what it refuses. */
export function validateOffBank(input: OffBankInput): { ok: true; row: OffBankRow } | { ok: false; error: string } {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Give the payment a positive amount." };
  if (!isOffBankMethod(input.method)) return { ok: false, error: `How did the money arrive? One of: ${OFF_BANK_METHODS.map((m) => m.label).join(", ")}.` };
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) return { ok: false, error: "An off-bank payment needs a reason. Say why this money will not be in the feed; it is printed next to the amount everywhere it shows." };
  const bookingId = typeof input.bookingId === "string" && input.bookingId ? input.bookingId : null;
  const documentId = typeof input.documentId === "string" && input.documentId ? input.documentId : null;
  if (!bookingId && !documentId) return { ok: false, error: "Say whose money it is: pick the booking or the invoice." };
  let date = typeof input.date === "string" && input.date.trim() ? input.date.trim().slice(0, 10) : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) return { ok: false, error: "The date must be a real day, as YYYY-MM-DD." };
  if (date > new Date().toISOString().slice(0, 10)) return { ok: false, error: "The date is in the future. Off-bank money is money that has already arrived." };
  date = date.slice(0, 10);
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
  return { ok: true, row: { bookingId, documentId, amount, date, method: input.method, reason, refund: input.refund === true, notes } };
}

/**
 * The back-door. Writes one revenue row with provenance 'off_bank' and the
 * reason the table insists on, against the booking (and invoice, when named),
 * then lets the invoice engine do what it does for any money landing.
 */
export async function recordOffBankPayment(input: OffBankInput & { by: string }):
  Promise<{ ok: true; payment: Record<string, unknown> } | { ok: false; error: string }> {
  const v = validateOffBank(input);
  if (!v.ok) return v;
  const row = v.row;
  const admin = db();

  let bookingId = row.bookingId;
  let contactId: string | null = null;
  let experienceId: string | null = null;
  let docType: string | null = null;

  if (row.documentId) {
    const { data: doc } = await admin.from("documents").select("id, booking_id, contact_id, type, status, invoice_number").eq("id", row.documentId).maybeSingle();
    if (!doc) return { ok: false, error: "That invoice does not exist." };
    if (doc.status !== "issued") return { ok: false, error: `Invoice ${doc.invoice_number ?? ""} is ${doc.status}; money cannot be recorded against it.` };
    if (bookingId && doc.booking_id && String(doc.booking_id) !== bookingId) return { ok: false, error: "That invoice belongs to a different booking." };
    bookingId = bookingId ?? (doc.booking_id as string | null);
    contactId = (doc.contact_id as string | null) ?? null;
    docType = doc.type as string;
  }
  if (bookingId) {
    const { data: booking } = await admin.from("exp_bookings").select("id, contact_id, experience_id").eq("id", bookingId).maybeSingle();
    if (!booking) return { ok: false, error: "That booking does not exist." };
    contactId = contactId ?? (booking.contact_id as string | null) ?? null;
    experienceId = (booking.experience_id as string | null) ?? null;
  }

  const label = OFF_BANK_METHODS.find((m) => m.key === row.method)!.label;
  const { data: created, error } = await admin
    .from("exp_payments")
    .insert({
      booking_id: bookingId,
      contact_id: contactId,
      document_id: row.documentId,
      experience_id: experienceId,
      amount: row.amount,
      type: row.refund ? "refund" : row.documentId ? paymentTypeFor(docType) : "partial",
      direction: "revenue",
      status: "paid",
      method: row.method,
      reference: null,
      date: row.date,
      received_at: `${row.date}T12:00:00Z`,
      unmatched: false,
      bank_transaction_id: null,
      provenance: "off_bank",
      off_bank_reason: row.reason,
      notes: [`Off-bank · ${label} · ${row.reason}`, row.notes].filter(Boolean).join(" · "),
    })
    .select()
    .single();
  if (error || !created) return { ok: false, error: `Recording the payment: ${error?.message ?? "insert failed"}` };

  await afterMoneyLanded(bookingId);
  return { ok: true, payment: created as Record<string, unknown> };
}

/** Say that a hand-typed row is money the feed will never show. */
export async function markOffBank(opts: { paymentId: string; reason: unknown; method?: unknown }):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = String(opts.reason ?? "").trim();
  if (reason.length < 3) return { ok: false, error: "Say why this money will not be in the feed." };
  const admin = db();
  const { data: p } = await admin.from("exp_payments").select("id, provenance, bank_transaction_id, reference, notes, method").eq("id", opts.paymentId).maybeSingle();
  if (!p) return { ok: false, error: "No such payment." };
  if (p.provenance === "legacy") return { ok: false, error: "That payment is from before this company invoiced; it stays in the archive as it is." };
  if (p.bank_transaction_id) return { ok: false, error: "That payment names a bank movement; it is not off-bank." };
  if (isAllocationRef(p.reference)) return { ok: false, error: "That row moves money between two bookings; it is neither bank nor off-bank." };
  const method = isOffBankMethod(opts.method) ? opts.method : null;
  const { error } = await admin
    .from("exp_payments")
    .update({
      provenance: "off_bank",
      off_bank_reason: reason,
      ...(method ? { method } : {}),
      unmatched: false,
    })
    .eq("id", p.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
