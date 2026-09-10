/**
 * The matcher, against the cases that actually occur in NP7's ledger.
 *
 * The property that matters most is a NEGATIVE one: eleven guests owe €2,445
 * for the same Bonaire week, so a transfer for €2,445 with no reference must
 * never be booked automatically. Every other check here is about making sure
 * the certain cases still go through.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-bank-match.mts
 */
import { suggestForTransaction, autoMatchable, type MatchCandidate, type MatchInput } from "@/lib/bank/match";
import { normaliseQonto, type QontoTx } from "@/lib/bank/qonto";

let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${note ? "  — " + note : ""}`);
  if (!ok) failed++;
};

const inv = (over: Partial<MatchCandidate>): MatchCandidate => ({
  documentId: "doc-" + Math.random().toString(36).slice(2, 8),
  invoiceNumber: "NP7-XP-2026-0184",
  bookingId: "b1", contactId: "c1",
  guestName: "Leendert Hubregtse", guestEmail: "leendert@example.com",
  experienceTitle: "Bonaire 2026", editionLabel: "Week III",
  invoiced: 2445, remaining: 2445, currency: "EUR",
  dueDate: "2026-08-01", issuedAt: "2026-07-01", knownIbans: [],
  ...over,
});

const tx = (over: Partial<MatchInput>): MatchInput => ({
  amount: 2445, currency: "EUR", reference: null, counterparty: null,
  counterpartyIban: null, bookedOn: "2026-08-10",
  ...over,
});

/* ── 1. The reference is the whole scheme. ─────────────────────────────────── */
{
  const c = inv({});
  const m = suggestForTransaction(tx({ reference: "NP7-XP-2026-0184 Bonaire" }), [c]);
  check("invoice number in the reference wins", m[0]?.candidate.documentId === c.documentId && m[0].confidence === "exact",
    m[0] ? `score ${m[0].score}` : "no match");
  check("…and is booked without asking", !!autoMatchable(m, 2445));
}
{
  // Banks mangle punctuation constantly. "NP7 XP 2026 0184" is the same number.
  const c = inv({});
  const m = suggestForTransaction(tx({ reference: "UEBERWEISUNG NP7 XP 2026 0184" }), [c]);
  check("a reference stripped of its hyphens still matches", m[0]?.confidence === "exact");
}

/* ── 2. THE SAFETY PROPERTY. Same amount, no reference. ────────────────────── */
{
  const many = Array.from({ length: 11 }, (_, i) =>
    inv({ documentId: `doc-${i}`, invoiceNumber: `NP7-XP-2026-01${80 + i}`, guestName: `Guest ${i}`, contactId: `c${i}` }));
  const m = suggestForTransaction(tx({ amount: 2445, reference: "Bonaire Anzahlung", counterparty: "J MEIJER" }), many);
  check("eleven guests owe €2,445 and the payer matches none → offers nobody", m.length === 0,
    "naming one of eleven at random is worse than saying 'no idea'");
  check("…and NEVER books one automatically", autoMatchable(m, 2445) === null,
    "this is the €6,210-style error the whole design exists to prevent");
}
{
  // The real noise case from the first live run: a Google Ads refund was
  // proposed against a guest purely because 746.15 is "part of" 4,250.
  const guests = [inv({ guestName: "Peter ten Veldhuis", remaining: 4250, invoiceNumber: "PF-SCXP-2026-47B040-FIN" })];
  const m = suggestForTransaction(tx({ amount: 746.15, counterparty: "Google Ireland Limited", reference: null }), guests);
  check("a supplier refund is matched to nobody", m.length === 0,
    "amount alone must never put a person's name on a transaction");
}
{
  // But when exactly ONE invoice is owed precisely this figure, that
  // uniqueness is itself worth saying.
  const only = [inv({ remaining: 1234.56, guestName: "Solo Guest" }), inv({ documentId: "d2", remaining: 999, guestName: "Other" })];
  const m = suggestForTransaction(tx({ amount: 1234.56, counterparty: "SOME COMPANY BV" }), only);
  check("a uniquely-matching amount is still offered", m.length === 1 && m[0].confidence === "possible",
    m[0]?.reasons.join(" · "));
  check("…but not auto-booked, because nothing named the guest", autoMatchable(m, 1234.56) === null);
}

/* ── 3. Name plus exact amount is strong, not certain. ─────────────────────── */
{
  const c = inv({ invoiceNumber: null });
  const m = suggestForTransaction(tx({ counterparty: "LEENDERT HUBREGTSE", reference: "Bonaire" }), [c]);
  check("payer name recognises the guest", m[0]?.reasons.some((r) => r.includes("Leendert")));
  check("name + amount alone is not enough to auto-book", autoMatchable(m, 2445) === null);
}

/* ── 4. Our own checkout metadata is exact by construction. ────────────────── */
{
  const c = inv({ invoiceNumber: null, bookingId: "7f3a1b2c-0000-4000-8000-000000000001" });
  const m = suggestForTransaction(
    tx({ reference: `booking:7f3a1b2c-0000-4000-8000-000000000001 · Race Clinic` }), [c]);
  check("Stripe metadata names the booking", m[0]?.reasons.some((r) => r.includes("metadata")));
  check("…and that is enough to book it", !!autoMatchable(m, 2445));
}

/* ── 5. Money beyond the bill is a question, not a settlement. ─────────────── */
{
  const c = inv({ remaining: 1000 });
  const m = suggestForTransaction(tx({ amount: 2445, reference: "NP7-XP-2026-0184" }), [c]);
  check("an overpayment is suggested", m.length > 0);
  check("…but never booked automatically", autoMatchable(m, 2445) === null,
    "€2,445 against €1,000 owed needs a human");
}

/* ── 6. Part payments are recognised as such. ──────────────────────────────── */
{
  const c = inv({ remaining: 2445 });
  const m = suggestForTransaction(tx({ amount: 1000, reference: "NP7-XP-2026-0184" }), [c]);
  check("a part payment says what would remain", !!m[0]?.reasons.some((r) => r.includes("1445")),
    m[0]?.reasons.join(" · "));
  check("…and is bookable, because the reference is unambiguous", !!autoMatchable(m, 1000));
}

/* ── 7. A settled invoice is out of the running. ───────────────────────────── */
{
  const paid = inv({ remaining: 0 });
  const open = inv({ documentId: "doc-open", invoiceNumber: "NP7-XP-2026-0190", guestName: "Someone Else" });
  const m = suggestForTransaction(tx({ reference: "NP7-XP-2026-0184" }), [paid, open]);
  check("a fully paid invoice is never proposed", !m.some((s) => s.candidate.documentId === paid.documentId));
}

/* ── 8. Money going out is not a sales settlement. ─────────────────────────── */
{
  const m = suggestForTransaction(tx({ amount: -2445, reference: "NP7-XP-2026-0184" }), [inv({})]);
  check("a debit never settles a sales invoice", m.length === 0);
}

/* ── 9. A known IBAN carries the guest across a nameless transfer. ──────────── */
{
  const c = inv({ invoiceNumber: null, knownIbans: ["DE02120300000000202051"] });
  const m = suggestForTransaction(tx({ counterpartyIban: "DE02 1203 0000 0000 2020 51", reference: "Rest" }), [c]);
  check("an IBAN that paid before is a real signal", m[0]?.reasons.some((r) => r.includes("IBAN")));
}

/* ── 10. Currency is not decoration. ───────────────────────────────────────── */
{
  const eur = inv({ currency: "EUR" });
  const usd = inv({ documentId: "doc-usd", currency: "USD", invoiceNumber: "NP7-XP-2026-0999", guestName: "US Guest" });
  const m = suggestForTransaction(tx({ amount: 750, currency: "USD", reference: "" }), [eur, usd]);
  const eurHit = m.find((s) => s.candidate.documentId === eur.documentId);
  check("paying in the wrong currency is penalised", !eurHit || eurHit.reasons.some((r) => r.includes("came in")));
}

/* ── 11. The Qonto mapping. ────────────────────────────────────────────────────
   Every field here is taken from the client that has actually been running
   against this account, not from the public docs, which got three of them
   wrong. These checks are what stops that knowledge being lost again. */
const qonto = (over: Partial<QontoTx> = {}): QontoTx => ({
  transaction_id: "tx_9f21", amount_cents: 376500, side: "credit", currency: "EUR",
  label: "David Koehler", reference: "NP7-XP-2026-0184", note: null,
  operation_type: "transfer", settled_at: "2026-08-31T09:14:00.000Z",
  emitted_at: "2026-08-30T18:02:00.000Z", status: "completed",
  counterparty_iban: "DE02120300000000202051", ...over,
});

{
  const n = normaliseQonto(qonto(), "DE05100101236088979708")!;
  check("cents plus side become a signed euro amount", n.amount === 3765, String(n.amount));
  check("the payer's name comes from `label`", n.counterparty === "David Koehler");
  check("the Verwendungszweck comes from `reference`", n.reference === "NP7-XP-2026-0184");
  check("settled_at is the booking date", n.bookedOn === "2026-08-31");
  check("a credit is income", n.kind === "income");
}
{
  const n = normaliseQonto(qonto({ side: "debit", amount_cents: 84000, label: "Sorobon Beach Resort" }), null)!;
  check("a debit is negative and is money out", n.amount === -840 && n.kind === "expense", String(n.amount));
}
{
  // THE trap: the same card money arriving a second time as one net credit.
  const n = normaliseQonto(qonto({ label: "STRIPE PAYMENTS EUROPE LTD", reference: "STRIPE PAYOUT", amount_cents: 219000 }), null)!;
  check("a Stripe payout is never income", n.kind === "payout",
    "otherwise the whole card volume counts twice");
}
{
  const n = normaliseQonto(qonto({ operation_type: "qonto_fee", side: "debit", amount_cents: 1900, label: "Qonto" }), null)!;
  check("the account fee is a fee", n.kind === "fee");
}
{
  // A pending card authorisation has no settled_at; emitted_at stands in.
  const n = normaliseQonto(qonto({ settled_at: null, status: "pending" }), null)!;
  check("a pending row falls back to emitted_at", n.bookedOn === "2026-08-30" && n.status === "pending");
}
{
  check("a row with no id is dropped", normaliseQonto(qonto({ transaction_id: undefined }), null) === null);
  check("a row with no date is dropped", normaliseQonto(qonto({ settled_at: null, emitted_at: null }), null) === null);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
