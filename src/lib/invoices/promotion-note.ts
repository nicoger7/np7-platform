/**
 * What a payment did beyond landing, in words the office can read.
 *
 * Money that covers an open payment request does not just sit there: the real
 * tax invoice is issued with a gapless number, the guest is emailed it, and a
 * fresh request is opened for whatever is still owed. All of that was
 * invisible in the admin, so nobody could tell that one click had sent a guest
 * an invoice. promoteProformaIfPaid now reports what it did; this turns that
 * report into the sentence the page prints.
 *
 * Pure on purpose. The wording is the same wherever money lands, and it can be
 * checked without a database.
 */

export type PromotedInvoice = {
  documentId: string;
  invoiceNumber: string | null;
  amount: number | null;
  currency: string;
  /** Whether the mail ACTUALLY went. The send is deduped and can be switched
   *  off, so "we called sendEmail" is not the same as "the guest has it". */
  emailed: boolean;
  /** Who it went to: the guest's name when there is one, else the address. */
  emailedTo: string | null;
};

export type PromotionOutcome = {
  promoted: boolean;
  /** The last real invoice issued. Kept for callers that only want the id. */
  documentId?: string;
  /** Each stage this money settled, oldest first. Paying in full settles two. */
  invoices: PromotedInvoice[];
  /** The fresh request opened for the rest, when one was. */
  balanceRequested: { amount: number; currency: string } | null;
};

export const emptyPromotion = (): PromotionOutcome => ({ promoted: false, invoices: [], balanceRequested: null });

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

const joinList = (parts: string[]) =>
  parts.length <= 1 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/**
 * One or two sentences, or null when the payment only recorded money.
 *
 * Null is the ordinary case and has to stay silent: most payments settle a
 * real invoice that already exists, and a line saying "nothing else happened"
 * on every click would train the team to stop reading the one that matters.
 */
export function describePromotion(outcome: PromotionOutcome | null | undefined): string | null {
  if (!outcome) return null;
  const issued = outcome.invoices ?? [];
  const balance = outcome.balanceRequested;
  const balanceSentence = balance && balance.amount > 0
    ? `A new request for ${money(balance.amount, balance.currency)} is open for the balance.`
    : null;
  if (!issued.length) return balanceSentence;

  const label = issued.length === 1 ? "Invoice" : "Invoices";
  // A number is always assigned with the document; "(no number)" is honest
  // about a gap rather than dressing one up as a sentence.
  const name = (i: PromotedInvoice) => i.invoiceNumber || "(no number)";
  const sent = issued.filter((i) => i.emailed);
  const to = joinList([...new Set(sent.map((i) => i.emailedTo).filter(Boolean) as string[])]);

  let first: string;
  if (!sent.length) {
    // Worth saying out loud: the invoice exists and is numbered, but the guest
    // has not been told, so somebody still has to send it.
    first = `${label} ${joinList(issued.map(name))} issued. No email went out.`;
  } else if (sent.length === issued.length) {
    first = `${label} ${joinList(issued.map(name))} issued${to ? ` and emailed to ${to}` : " and emailed"}.`;
  } else {
    first = `${label} ${joinList(issued.map(name))} issued, ${joinList(sent.map(name))} emailed${to ? ` to ${to}` : ""}.`;
  }
  return balanceSentence ? `${first} ${balanceSentence}` : first;
}
