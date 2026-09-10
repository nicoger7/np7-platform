/**
 * Which invoice does this money belong to?
 *
 * Pure scoring, no database — so it can be tested against real historical
 * transfers without touching the books, and so a rule can be changed and
 * re-run over everything that was already imported.
 *
 * The ranking follows how the money is actually meant to arrive. Nico's
 * bookkeeping plan puts the NP7 invoice number in the Belegnummer field
 * precisely so the bank reconciliation finds the payment by itself, and guests
 * are asked to quote it on the transfer. So the reference beats everything.
 * When it is missing — and on a bank transfer it very often is, because people
 * type "Bonaire Anzahlung" — the fallbacks are, in order: an id our own
 * checkout stamped on the charge, the payer's name against the guest's name,
 * an IBAN we have seen pay for this person before, and the amount.
 *
 * The amount alone is never allowed to decide. Eleven guests owe €2,445 for
 * the same Bonaire week; matching on price would pick one of them at random
 * and be wrong ten times out of eleven.
 */
import { round2 } from "@/lib/reconcile";

export type MatchCandidate = {
  documentId: string;
  invoiceNumber: string | null;
  bookingId: string | null;
  contactId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  experienceTitle: string | null;
  editionLabel: string | null;
  invoiced: number;
  remaining: number;
  currency: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  /** IBANs that have already paid an invoice of this contact. */
  knownIbans?: string[];
};

export type MatchInput = {
  amount: number;
  currency: string;
  reference: string | null;
  counterparty: string | null;
  counterpartyIban: string | null;
  bookedOn: string;
};

export type BankMatch = {
  candidate: MatchCandidate;
  score: number;
  reasons: string[];
  confidence: "exact" | "strong" | "possible";
  /**
   * Something in the transaction NAMES this invoice — the invoice number, an
   * id our own checkout stamped on the charge, the guest's own email address.
   * Deliberately separate from the score, because identification and amount
   * are different questions: a guest who quotes the number and pays half has
   * identified the invoice perfectly. Resemblance (a similar name, a matching
   * price) never sets this, however high it scores.
   */
  identified: boolean;
};

/** Uppercase, accent-free, alphanumeric only — so "NP7-XP-2026-0184" and the
 *  bank's "NP7 XP 2026 0184" become the same string. */
const squash = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Name tokens worth comparing. Drops initials and the noise banks add. */
const NAME_NOISE = new Set([
  "MR", "MRS", "MS", "DR", "HERR", "FRAU", "VON", "VAN", "DER", "DEN", "DE", "DA",
  "GMBH", "UG", "AG", "BV", "NV", "LTD", "SARL", "REF", "RECHNUNG", "INVOICE",
  "PAYMENT", "ZAHLUNG", "UEBERWEISUNG", "TRANSFER",
]);

const nameTokens = (s: string | null | undefined): string[] =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((t) => t.length >= 3 && !NAME_NOISE.has(t));

/** How much of the guest's name shows up in the payer's name (0…1). */
function nameOverlap(payer: string | null | undefined, guest: string | null | undefined): number {
  const a = new Set(nameTokens(payer));
  const b = nameTokens(guest);
  if (!a.size || !b.length) return 0;
  const hit = b.filter((t) => a.has(t)).length;
  return hit / b.length;
}

export function suggestForTransaction(tx: MatchInput, candidates: MatchCandidate[]): BankMatch[] {
  const amount = round2(tx.amount);
  if (amount <= 0) return []; // money out is a cost, not an invoice settlement

  const ref = squash(tx.reference);
  const refRaw = (tx.reference || "").toLowerCase();
  const iban = squash(tx.counterpartyIban);

  const scored: BankMatch[] = [];

  for (const c of candidates) {
    if (c.remaining <= 0.01) continue;

    let score = 0;
    let identified = false;
    /* Does anything about this transaction point at a PERSON — as opposed to
       merely fitting an amount? Set by the reference, our own metadata, the
       payer's name, their email, a known IBAN. Never by money. */
    let identitySignal = false;
    const reasons: string[] = [];

    // ── 1. The reference. What the whole scheme is built on. ────────────────
    const num = squash(c.invoiceNumber);
    if (num && ref && ref.includes(num)) {
      score += 100;
      identified = true;
      identitySignal = true;
      reasons.push(`Quotes invoice ${c.invoiceNumber}`);
    } else if (num.length >= 4 && ref) {
      // A guest who types only the tail of the number ("0184") still gives us
      // something, but never enough to decide on its own.
      const tail = num.slice(-4);
      if (/\d{4}/.test(tail) && new RegExp(`(^|[^0-9])${tail}([^0-9]|$)`).test(ref)) {
        score += 25;
        identitySignal = true;
        reasons.push(`Reference contains ${tail}`);
      }
    }

    // ── 2. Ids our own checkout stamped on the charge. Exact by construction. ─
    if (c.bookingId && refRaw.includes(c.bookingId.toLowerCase())) {
      score += 95;
      identified = true;
      identitySignal = true;
      reasons.push("Stripe metadata names this booking");
    } else if (c.contactId && refRaw.includes(c.contactId.toLowerCase())) {
      score += 80;
      identified = true;
      identitySignal = true;
      reasons.push("Stripe metadata names this guest");
    }

    // ── 3. Who sent it. ─────────────────────────────────────────────────────
    const overlap = Math.max(
      nameOverlap(tx.counterparty, c.guestName),
      // Some banks put the name only in the reference text.
      nameOverlap(tx.reference, c.guestName)
    );
    if (overlap >= 0.99) {
      score += 45;
      identitySignal = true;
      reasons.push(`Paid by ${c.guestName}`);
    } else if (overlap >= 0.5) {
      score += 28;
      identitySignal = true;
      reasons.push(`Payer name resembles ${c.guestName}`);
    }
    if (c.guestEmail && refRaw.includes(c.guestEmail.toLowerCase())) {
      score += 40;
      identified = true;
      identitySignal = true;
      reasons.push("Payer email matches the guest");
    }

    // ── 4. An IBAN that has paid for this guest before. ──────────────────────
    if (iban && (c.knownIbans ?? []).some((k) => squash(k) === iban)) {
      score += 55;
      identitySignal = true;
      reasons.push("This IBAN has paid for them before");
    }

    // ── 5. The amount. Confirms, never decides. ──────────────────────────────
    if (Math.abs(c.remaining - amount) < 0.01) {
      score += 45;
      reasons.push("Settles the invoice exactly");
    } else if (Math.abs(c.invoiced - amount) < 0.01) {
      score += 30;
      reasons.push("Equals the invoiced amount");
    } else if (amount < c.remaining) {
      score += 10;
      reasons.push(`Part payment · ${round2(c.remaining - amount)} would remain`);
    } else {
      score += 2;
      reasons.push("More than this invoice is owed");
    }

    // ── 6. Timing and currency. Gentle. ─────────────────────────────────────
    if (c.issuedAt) {
      const days = Math.abs(
        (new Date(tx.bookedOn).getTime() - new Date(c.issuedAt).getTime()) / 86_400_000
      );
      if (days <= 45) { score += 8; }
      else if (days > 400) { score -= 10; }
    }
    if (c.currency && tx.currency && c.currency.toUpperCase() !== tx.currency.toUpperCase()) {
      score -= 25;
      reasons.push(`Invoice is in ${c.currency}, the money came in ${tx.currency}`);
    }

    /*
     * No identity signal, no suggestion. This is the difference between a
     * useful page and a misleading one.
     *
     * Without it, every credit found some invoice its amount could be a part
     * payment of: a Google Ads refund, a Qonto rebate, a tax refund from the
     * Finanzamt and a DJI invoice were all proposed against the same guest,
     * because 900 EUR is plausibly "part of" 4,250 EUR. Putting a person's
     * name next to a transaction that has nothing to do with them is worse
     * than saying nothing, and it teaches whoever reads this page to stop
     * trusting the column.
     */
    if (!identitySignal) continue;
    if (score <= 10) continue;
    scored.push({
      candidate: c,
      score,
      reasons,
      identified,
      confidence: identified ? "exact" : score >= 80 ? "strong" : "possible",
    });
  }

  /*
   * One fallback, for the case where the amount really does say something:
   * when nothing names anyone AND exactly one open invoice is owed precisely
   * this figure, that uniqueness is itself the signal. Two invoices at the
   * same price cancel it out, which is the Bonaire case and the reason this
   * is a fallback rather than a rule.
   */
  if (!scored.length) {
    const exact = candidates.filter(
      (c) => c.remaining > 0.01 && (Math.abs(c.remaining - amount) < 0.01 || Math.abs(c.invoiced - amount) < 0.01)
    );
    if (exact.length === 1) {
      scored.push({
        candidate: exact[0],
        score: 40,
        reasons: ["The only open invoice for exactly this amount"],
        identified: false,
        confidence: "possible",
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * May this be booked without a human looking at it?
 *
 * Three conditions, all required.
 *
 * It must be IDENTIFIED, not merely likely — the transaction has to name the
 * invoice. A name that resembles the guest and a price that happens to fit are
 * how you book Jean-Marc's money onto David's booking.
 *
 * No second invoice may be identified too. If a reference somehow names two,
 * that is a question, not a match.
 *
 * And it must not overpay: money beyond the bill means something else is going
 * on — an extra, a second guest, a mistake — and that is for a person to read.
 * A PART payment is fine, because the reference already said which invoice.
 *
 * Everything else becomes a suggestion with its reasons written out, which is
 * what Nico asked for: auto-match what is certain, propose the rest.
 */
export function autoMatchable(matches: BankMatch[], amount: number): BankMatch | null {
  const identified = matches.filter((m) => m.identified);
  if (identified.length !== 1) return null;
  const best = identified[0];
  if (amount > best.candidate.remaining + 0.01) return null;
  return best;
}

/**
 * One transfer, several invoices.
 *
 * Minna Mäntynen sent €6,650 quoting NP7-XP-2026-0043, and that invoice is
 * only €4,400. The other €2,250 is not a mystery: she has three more open
 * invoices at €750 each, and 4,400 + 750 + 750 + 750 is exactly what arrived.
 * Guests pay their balance, not their paperwork.
 *
 * A matcher that only ever proposes one invoice makes that look like an
 * overpayment and leaves a person to work the arithmetic out by hand, four
 * times, every time. So: when a guest's open invoices contain a combination
 * that sums to the transfer exactly, propose the whole combination.
 *
 * Deliberately strict. Only invoices belonging to ONE guest are combined, and
 * only an EXACT total counts. A near-miss is not a set; it is a question, and
 * this returns nothing rather than inviting someone to accept a guess.
 */
export type InvoiceSet = {
  candidates: MatchCandidate[];
  total: number;
  guestName: string | null;
  /** True when it is every open invoice the guest has, which is the common case. */
  everything: boolean;
};

const CENTS = (n: number) => Math.round(n * 100);

export function suggestInvoiceSet(tx: MatchInput, candidates: MatchCandidate[]): InvoiceSet | null {
  const target = CENTS(tx.amount);
  if (target <= 0) return null;

  // Only guests this transaction actually points at — the same identity rule
  // as everywhere else. Without it, any four invoices adding up would do.
  const named = new Set(
    suggestForTransaction(tx, candidates)
      .filter((m) => m.identified || m.reasons.some((r) => /Paid by|resembles|IBAN|email/.test(r)))
      .map((m) => m.candidate.contactId)
      .filter(Boolean) as string[]
  );
  if (!named.size) return null;

  for (const contactId of named) {
    const mine = candidates.filter((c) => c.contactId === contactId && c.remaining > 0.01);
    // A single invoice is the ordinary path and is handled above; a set needs
    // at least two. More than ten is not a person paying their balance.
    if (mine.length < 2 || mine.length > 10) continue;

    const sumAll = mine.reduce((s, c) => s + CENTS(c.remaining), 0);
    if (sumAll === target) {
      return { candidates: mine, total: tx.amount, guestName: mine[0].guestName, everything: true };
    }

    // Otherwise look for any exact subset. Ten invoices is 1023 combinations,
    // which is nothing, and the cap above is what keeps it that way.
    const n = mine.length;
    let best: MatchCandidate[] | null = null;
    for (let mask = 1; mask < 1 << n; mask++) {
      let sum = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += CENTS(mine[i].remaining);
      if (sum !== target) continue;
      const picked = mine.filter((_, i) => mask & (1 << i));
      if (picked.length < 2) continue;
      // Prefer the smallest set that works: fewer documents, fewer decisions.
      if (!best || picked.length < best.length) best = picked;
    }
    if (best) return { candidates: best, total: tx.amount, guestName: best[0].guestName, everything: false };
  }
  return null;
}
