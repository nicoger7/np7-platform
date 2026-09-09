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
  check("eleven guests owe the same €2,445 → still suggests", m.length > 0);
  check("…but NEVER books one automatically", autoMatchable(m, 2445) === null,
    "this is the €6,210-style error the whole design exists to prevent");
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

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
