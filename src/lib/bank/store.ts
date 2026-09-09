/**
 * Everything that reads or writes the bank ledger.
 *
 * The two layers this file keeps apart:
 *   bank_transactions — what the bank says happened. Imported, never authored.
 *   exp_payments      — what NP7 books against a booking. An interpretation.
 * Matching creates the second from the first and links them both ways, so the
 * books can always be walked back to a real movement.
 */
import { createClient } from "@supabase/supabase-js";
import { paymentInflow, round2, type ReconPayment } from "@/lib/reconcile";
import { suggestForTransaction, autoMatchable, type MatchCandidate, type BankMatch } from "./match";

/* The invoice engine is imported lazily. It is a server-only module and it
   pulls in the whole PDF stack, so a plain read of this file — a script
   checking the candidate list, say — should not have to load it. */
async function settle(bookingId: string) {
  const { settleInvoices } = await import("@/lib/invoices/generate");
  return settleInvoices(bookingId);
}
import type { BankTransactionRow, NormalisedTransaction } from "./types";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/* ── Import ──────────────────────────────────────────────────────────────── */

/**
 * Write normalised rows in, skipping anything already here.
 *
 * The unique index on (source, external_id) is what makes a re-sync free, so
 * this deliberately does NOT overwrite an existing row: once a transaction has
 * been matched by a human, a later sync must not quietly move it. Only the
 * fields a bank legitimately revises — status and settlement date on a row
 * that was pending — are refreshed.
 */
export async function importTransactions(
  rows: NormalisedTransaction[],
  division = "experience"
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  if (!rows.length) return { inserted: 0, updated: 0, errors: [] };
  const admin = db();
  const errors: string[] = [];

  const { data: existing, error: exErr } = await admin
    .from("bank_transactions")
    .select("id, source, external_id, status")
    .in("external_id", rows.map((r) => r.externalId));
  if (exErr) errors.push(`Reading existing transactions: ${exErr.message}`);

  const seen = new Map<string, { id: string; status: string }>();
  for (const e of existing ?? []) seen.set(`${e.source}:${e.external_id}`, { id: e.id, status: e.status });

  const toInsert = rows.filter((r) => !seen.has(`${r.source}:${r.externalId}`));
  const pendingNowSettled = rows.filter((r) => {
    const prev = seen.get(`${r.source}:${r.externalId}`);
    return prev && prev.status === "pending" && r.status !== "pending";
  });

  let inserted = 0;
  // Chunked, because a first import can be years of history in one call.
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200).map((r) => ({
      division,
      source: r.source,
      external_id: r.externalId,
      account_ref: r.accountRef ?? null,
      booked_on: r.bookedOn,
      executed_at: r.executedAt ?? null,
      amount: r.amount,
      currency: r.currency,
      counterparty: r.counterparty ?? null,
      counterparty_iban: r.counterpartyIban ?? null,
      reference: r.reference ?? null,
      label: r.label ?? null,
      status: r.status,
      kind: r.kind,
      raw: r.raw,
    }));
    const { error, count } = await admin
      .from("bank_transactions")
      .insert(chunk, { count: "exact" });
    if (error) errors.push(`Inserting ${chunk.length} rows: ${error.message}`);
    else inserted += count ?? chunk.length;
  }

  let updated = 0;
  for (const r of pendingNowSettled) {
    const prev = seen.get(`${r.source}:${r.externalId}`)!;
    const { error } = await admin
      .from("bank_transactions")
      .update({ status: r.status, booked_on: r.bookedOn, executed_at: r.executedAt ?? null, raw: r.raw })
      .eq("id", prev.id);
    if (error) errors.push(`Settling ${r.externalId}: ${error.message}`);
    else updated++;
  }

  return { inserted, updated, errors };
}

/* ── Reconciling with what was already booked by hand ────────────────────── */

/**
 * Tie imported transactions to payments that were already entered manually.
 *
 * Every exp_payments row today was typed off a sheet or a statement. Thirteen
 * of them carry a Stripe `pi_…` in `reference`, and the bank rows carry their
 * statement line number. Where those strings identify the same money, the two
 * are the same event and must not both count — this links them instead of
 * letting the import create a second copy of the €6,210 problem.
 */
export async function reconcileWithExistingPayments(): Promise<{ linked: number }> {
  const admin = db();
  const { data: txs } = await admin
    .from("bank_transactions")
    .select("id, external_id, reference, amount, booked_on, source")
    .is("payment_id", null)
    .is("ignored_at", null)
    .gt("amount", 0);
  if (!txs?.length) return { linked: 0 };

  const { data: payments } = await admin
    .from("exp_payments")
    .select("id, amount, reference, date, received_at, document_id, booking_id")
    .is("bank_transaction_id", null)
    .eq("direction", "revenue");
  if (!payments?.length) return { linked: 0 };

  const norm = (s: string | null) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let linked = 0;

  for (const tx of txs) {
    const ext = norm(tx.external_id);
    const hit = payments.find((p) => {
      const pref = norm(p.reference);
      if (!pref || !ext) return false;
      // Same identifier AND same money — either alone is not enough. A bank
      // line number like "229" repeats across years, which is exactly why
      // migration 165 scoped the payments unique index to Stripe ids.
      const sameRef = pref === ext || ext.includes(pref) || pref.includes(ext);
      return sameRef && Math.abs(Number(p.amount) - Number(tx.amount)) < 0.01;
    });
    if (!hit) continue;

    await admin.from("bank_transactions")
      .update({
        payment_id: hit.id,
        document_id: hit.document_id ?? null,
        matched_at: new Date().toISOString(),
        matched_by: "import",
        match_confidence: "auto",
      })
      .eq("id", tx.id);
    await admin.from("exp_payments").update({ bank_transaction_id: tx.id, unmatched: false }).eq("id", hit.id);
    payments.splice(payments.indexOf(hit), 1);
    linked++;
  }
  return { linked };
}

/* ── Candidates ──────────────────────────────────────────────────────────── */

/**
 * Every invoice still owed money, with enough context to recognise its guest.
 *
 * Pro-formas are included on purpose: a pro-forma IS the payment request, it
 * carries the reference the guest quotes, and a paid one is promoted to a real
 * invoice afterwards. Voided ones drop out with the status filter.
 *
 * No PostgREST embeds — documents has two foreign keys into contacts, and a
 * short `contacts(...)` embed on it is exactly what took the admin down on
 * 2026-09-01 with a 300 Multiple Choices. Four flat reads and a join in
 * memory is duller and cannot break that way.
 */
export async function loadCandidates(division = "experience"): Promise<MatchCandidate[]> {
  const admin = db();

  const { data: docs } = await admin
    .from("documents")
    .select("id, invoice_number, booking_id, contact_id, type, amount, currency, status, due_date, issued_at, meta")
    .eq("division", division)
    .eq("status", "issued")
    .neq("type", "booking_confirmation");
  if (!docs?.length) return [];

  const { data: pays } = await admin
    .from("exp_payments")
    .select("id, amount, type, direction, status, reference, method, received_at, document_id")
    .not("document_id", "is", null);

  const paidByDoc = new Map<string, number>();
  for (const p of (pays ?? []) as ReconPayment[]) {
    if (!p.document_id) continue;
    paidByDoc.set(p.document_id, round2((paidByDoc.get(p.document_id) ?? 0) + paymentInflow(p)));
  }

  const bookingIds = [...new Set(docs.map((d) => d.booking_id).filter(Boolean))] as string[];
  const contactIds = [...new Set(docs.map((d) => d.contact_id).filter(Boolean))] as string[];

  const [{ data: bookings }, { data: contacts }, { data: matchedTx }] = await Promise.all([
    bookingIds.length
      ? admin.from("exp_bookings").select("id, name, contact_id, edition_id, experience_id").in("id", bookingIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    contactIds.length
      ? admin.from("contacts").select("id, name, email").in("id", contactIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("bank_transactions")
      .select("counterparty_iban, document_id")
      .not("counterparty_iban", "is", null)
      .not("document_id", "is", null),
  ]);

  const bookingById = new Map((bookings ?? []).map((b) => [String(b.id), b]));
  const contactById = new Map((contacts ?? []).map((c) => [String(c.id), c]));

  // An IBAN that has settled one of a guest's invoices is a strong signal for
  // the next one — the same person usually pays from the same account.
  const docToContact = new Map(docs.map((d) => [d.id, d.contact_id]));
  const ibansByContact = new Map<string, string[]>();
  for (const t of matchedTx ?? []) {
    const cid = docToContact.get(t.document_id as string);
    if (!cid || !t.counterparty_iban) continue;
    const list = ibansByContact.get(String(cid)) ?? [];
    if (!list.includes(String(t.counterparty_iban))) list.push(String(t.counterparty_iban));
    ibansByContact.set(String(cid), list);
  }

  const experienceIds = [...new Set((bookings ?? []).map((b) => b.experience_id).filter(Boolean))] as string[];
  const { data: experiences } = experienceIds.length
    ? await admin.from("exp_experiences").select("id, title").in("id", experienceIds)
    : { data: [] as Record<string, unknown>[] };
  const expById = new Map((experiences ?? []).map((e) => [String(e.id), String(e.title)]));

  const out: MatchCandidate[] = [];
  for (const d of docs) {
    const invoiced = round2(Number(d.amount) || 0);
    if (invoiced <= 0) continue;
    const remaining = round2(Math.max(0, invoiced - (paidByDoc.get(d.id) ?? 0)));
    if (remaining <= 0.01) continue;

    const booking = d.booking_id ? bookingById.get(String(d.booking_id)) : null;
    const contactId = (d.contact_id as string) ?? (booking?.contact_id as string) ?? null;
    const contact = contactId ? contactById.get(String(contactId)) : null;
    const meta = (d.meta ?? {}) as Record<string, unknown>;

    out.push({
      documentId: d.id,
      invoiceNumber: d.invoice_number,
      bookingId: (d.booking_id as string) ?? null,
      contactId,
      guestName: (contact?.name as string) ?? (booking?.name as string) ?? null,
      guestEmail: (contact?.email as string) ?? null,
      experienceTitle:
        (meta.experience_title as string) ??
        (booking?.experience_id ? expById.get(String(booking.experience_id)) ?? null : null),
      editionLabel: (meta.edition_label as string) ?? null,
      invoiced,
      remaining,
      currency: d.currency,
      dueDate: d.due_date,
      issuedAt: d.issued_at,
      knownIbans: contactId ? ibansByContact.get(String(contactId)) ?? [] : [],
    });
  }
  return out;
}

/* ── Suggesting and matching ─────────────────────────────────────────────── */

export type TransactionWithMatches = BankTransactionRow & { suggestions: BankMatch[] };

/** Attach ranked suggestions to a set of transactions. */
export function withSuggestions(
  txs: BankTransactionRow[],
  candidates: MatchCandidate[]
): TransactionWithMatches[] {
  return txs.map((t) => ({
    ...t,
    suggestions:
      t.payment_id || t.ignored_at || t.amount <= 0 || t.kind !== "income"
        ? []
        : suggestForTransaction(
            {
              amount: Number(t.amount),
              currency: t.currency,
              reference: [t.reference, t.label].filter(Boolean).join(" · ") || null,
              counterparty: t.counterparty,
              counterpartyIban: t.counterparty_iban,
              bookedOn: t.booked_on,
            },
            candidates
          ),
  }));
}

/** Map an invoice type onto the payment type the books use. */
function paymentTypeFor(documentType: string | null | undefined): string {
  switch (documentType) {
    case "deposit_invoice": return "deposit";
    case "downpayment_invoice": return "downpayment";
    case "final_invoice": return "final";
    case "addon_invoice": return "addon";
    default: return "partial";
  }
}

/**
 * Book a transaction against an invoice.
 *
 * If the transaction already answers to a payment — because it was reconciled
 * with a hand-entered row — this ALLOCATES that payment rather than writing a
 * second one. That distinction is the whole reason the two tables are separate.
 */
export async function matchToInvoice(opts: {
  transactionId: string;
  documentId: string;
  by: string;
  confidence: "auto" | "suggested" | "manual";
}): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const admin = db();

  const { data: tx } = await admin.from("bank_transactions").select("*").eq("id", opts.transactionId).maybeSingle();
  if (!tx) return { ok: false, error: "No such transaction." };
  if (tx.ignored_at) return { ok: false, error: "That transaction was set aside — un-ignore it first." };
  if (Number(tx.amount) <= 0) return { ok: false, error: "Money going out cannot settle a sales invoice." };

  const { data: doc } = await admin
    .from("documents")
    .select("id, booking_id, contact_id, type, division, invoice_number")
    .eq("id", opts.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "No such invoice." };

  let paymentId: string;

  if (tx.payment_id) {
    const { error } = await admin
      .from("exp_payments")
      .update({ document_id: doc.id, unmatched: false })
      .eq("id", tx.payment_id);
    if (error) return { ok: false, error: `Allocating the existing payment: ${error.message}` };
    paymentId = tx.payment_id;
  } else {
    const { data: created, error } = await admin
      .from("exp_payments")
      .insert({
        booking_id: doc.booking_id,
        contact_id: doc.contact_id,
        document_id: doc.id,
        amount: Number(tx.amount),
        type: paymentTypeFor(doc.type),
        direction: "revenue",
        status: "paid",
        method: tx.source === "stripe" ? "stripe" : "bank_transfer",
        // The reference is the bank's own id, so this payment can always be
        // walked back to the movement that produced it.
        reference: `${tx.source}:${tx.external_id}`,
        date: tx.booked_on,
        received_at: tx.executed_at ?? `${tx.booked_on}T12:00:00Z`,
        unmatched: false,
        bank_transaction_id: tx.id,
        notes: tx.counterparty ? `Imported from ${tx.source} · paid by ${tx.counterparty}` : `Imported from ${tx.source}`,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: `Booking the payment: ${error?.message ?? "insert failed"}` };
    paymentId = created.id;
  }

  const { error: linkErr } = await admin
    .from("bank_transactions")
    .update({
      payment_id: paymentId,
      document_id: doc.id,
      matched_at: new Date().toISOString(),
      matched_by: opts.by,
      match_confidence: opts.confidence,
    })
    .eq("id", tx.id);
  if (linkErr) return { ok: false, error: `Linking the transaction: ${linkErr.message}` };

  // Stamp paid_at on whatever this now settles. Non-fatal: the money is booked
  // either way, and settlement recomputes from scratch on the next run.
  if (doc.booking_id) {
    await settle(doc.booking_id).catch((e) =>
      console.warn("[bank] settle after match failed (non-fatal):", e instanceof Error ? e.message : e));
  }

  return { ok: true, paymentId };
}

/** Undo a match. The payment this import created goes with it; a payment that
 *  existed beforehand is only un-allocated, never deleted. */
export async function unmatch(transactionId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = db();
  const { data: tx } = await admin.from("bank_transactions").select("*").eq("id", transactionId).maybeSingle();
  if (!tx) return { ok: false, error: "No such transaction." };
  if (!tx.payment_id) return { ok: true };

  const { data: pay } = await admin
    .from("exp_payments")
    .select("id, reference, booking_id, bank_transaction_id")
    .eq("id", tx.payment_id)
    .maybeSingle();

  const bornHere = pay?.reference === `${tx.source}:${tx.external_id}`;
  if (pay && bornHere) {
    await admin.from("exp_payments").delete().eq("id", pay.id);
  } else if (pay) {
    await admin.from("exp_payments").update({ document_id: null, bank_transaction_id: null }).eq("id", pay.id);
  }

  await admin.from("bank_transactions")
    .update({ payment_id: null, document_id: null, matched_at: null, matched_by: null, match_confidence: null })
    .eq("id", transactionId);

  if (pay?.booking_id) {
    await settle(pay.booking_id).catch(() => {});
  }
  return { ok: true };
}

/**
 * Book everything the matcher is certain about, leave the rest as suggestions.
 * This is the "auto-match some, propose the others" half of the brief.
 */
export async function autoMatchPending(by = "auto-match"): Promise<{ matched: number; considered: number }> {
  const admin = db();
  const { data: txs } = await admin
    .from("bank_transactions")
    .select("*")
    .is("payment_id", null)
    .is("ignored_at", null)
    .eq("kind", "income")
    .gt("amount", 0)
    .order("booked_on", { ascending: true });
  if (!txs?.length) return { matched: 0, considered: 0 };

  let candidates = await loadCandidates();
  let matched = 0;

  for (const tx of txs as BankTransactionRow[]) {
    const suggestions = suggestForTransaction(
      {
        amount: Number(tx.amount),
        currency: tx.currency,
        reference: [tx.reference, tx.label].filter(Boolean).join(" · ") || null,
        counterparty: tx.counterparty,
        counterpartyIban: tx.counterparty_iban,
        bookedOn: tx.booked_on,
      },
      candidates
    );
    const best = autoMatchable(suggestions, Number(tx.amount));
    if (!best) continue;

    const res = await matchToInvoice({
      transactionId: tx.id,
      documentId: best.candidate.documentId,
      by,
      confidence: "auto",
    });
    if (res.ok) {
      matched++;
      // Take the settled amount off the candidate so the next transaction in
      // the same run cannot be matched to money that is no longer owed.
      candidates = candidates
        .map((c) =>
          c.documentId === best.candidate.documentId
            ? { ...c, remaining: round2(c.remaining - Number(tx.amount)) }
            : c
        )
        .filter((c) => c.remaining > 0.01);
    }
  }
  return { matched, considered: txs.length };
}
