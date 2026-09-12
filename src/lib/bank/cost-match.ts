/**
 * Which expected cost does this debit pay for?
 *
 * The mirror of match.ts for money going OUT. Pure scoring, no database, so
 * it can be run over the real ledger without booking anything and a rule can
 * be changed and re-run over history.
 *
 * Money out is a different problem from money in. A guest quotes an invoice
 * number; a hotel does not quote our cost line. So there is no reference to
 * win on, and the ranking leans on what there is: whether the payee's name
 * appears in the cost line or its trip ("HOTEL PLAYA SUR TENERI" against
 * "Hotel · Tenerife 2026"), whether this payee has been allocated to this
 * trip before, whether the amount is what the line still expects, and whether
 * the money moved anywhere near the trip's dates.
 *
 * The amount alone never decides. Three editions each expect a €840 external
 * coach; a debit of €840 with a payee nobody recognises must not be pinned to
 * one of them at random. It is allowed to speak only when exactly one open
 * line wants precisely this figure, and even then only as "possible".
 *
 * Nothing here is ever booked without a click. There is deliberately no
 * autoMatchable() on this side: Nico's rule is that a sync imports and a
 * person allocates.
 */
import type { CostScope, CostState } from "@/lib/finance/costs";

export type CostCandidate = {
  costId: string;
  item: string;
  notes: string | null;
  scope: CostScope;
  scopeLabel: string;
  editionId: string | null;
  editionLabel: string | null;
  experienceId: string | null;
  experienceTitle: string | null;
  place: string | null;
  year: number | null;
  dateStart: string | null;
  dateEnd: string | null;
  status: string | null;
  marginClass: string | null;
  unplanned: boolean;
  estimated: number;
  actual: number | null;
  attached: number;
  /** What the line still expects and nothing real has covered yet. */
  open: number;
  state: CostState;
  /** Payees whose debits were allocated to this trip or experience before. */
  knownCounterparties: string[];
};

export type DebitInput = {
  /** Negative: money out. Pass the part NOT yet allocated, not the whole debit. */
  amount: number;
  currency: string;
  counterparty: string | null;
  reference: string | null;
  label: string | null;
  bookedOn: string;
};

export type CostMatch = {
  candidate: CostCandidate;
  score: number;
  reasons: string[];
  confidence: "strong" | "possible";
  /** min(what is left of the debit, what the line still expects). */
  suggestedAmount: number;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const squash = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Words that appear on both sides of nearly every hotel bill and say nothing. */
const GENERIC = new Set([
  "HOTEL", "HOTELS", "FLIGHT", "FLIGHTS", "RENTAL", "COACH", "LUNCH", "ROOM", "ROOMS", "TOTAL", "COSTS",
  "COST", "WEEK", "WEEKS", "EXPERIENCE", "WINDSURF", "BOOKING", "PAYMENT", "CARD", "TRANSFER",
  "INVOICE", "RECHNUNG", "GMBH", "LTD", "INC", "SARL", "BV", "NV", "SLU", "SL", "KG", "COM",
  "ESTIMATED", "CURRENT", "PARTICIPANT", "COUNT", "PLACEHOLDER", "ACTUAL", "KNOWN", "YET",
]);

const tokens = (s: string | null | undefined): string[] =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t));

/**
 * How the payee's words meet the cost line's words.
 * A specific word ("PLAYA", "SOROBON") is worth far more than a generic one
 * ("HOTEL"). Prefixes count: a card terminal truncates "TENERIFE" to "TENERI".
 */
function textHits(txText: string[], costText: string[]): { specific: string[]; generic: string[] } {
  const specific: string[] = [];
  const generic: string[] = [];
  const seen = new Set<string>();
  for (const a of txText) {
    for (const b of costText) {
      const exact = a === b;
      const prefix = !exact && a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a));
      // "TURKISH" against "TURKEY": the same stem, and only weakly a signal.
      const stem = !exact && !prefix && a.length >= 6 && b.length >= 6 && a.slice(0, 4) === b.slice(0, 4);
      if (!exact && !prefix && !stem) continue;
      const key = a.length <= b.length ? a : b;
      if (seen.has(key)) continue;
      seen.add(key);
      if (stem || GENERIC.has(a) || GENERIC.has(b)) generic.push(key);
      else specific.push(key);
    }
  }
  return { specific, generic };
}

const daysBetween = (a: string, b: string) =>
  Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

export function suggestCostsForDebit(tx: DebitInput, candidates: CostCandidate[]): CostMatch[] {
  const amount = r2(Math.abs(tx.amount));
  if (amount <= 0) return [];

  const txWords = tokens([tx.counterparty, tx.reference, tx.label].filter(Boolean).join(" "));
  const payee = squash(tx.counterparty);
  const txYear = Number(tx.bookedOn.slice(0, 4));

  // Uniqueness of an exact amount is computed once, against every open line.
  const exactOpen = candidates.filter((c) => c.open > 0.01 && Math.abs(c.open - amount) < 0.01);

  const scored: CostMatch[] = [];
  for (const c of candidates) {
    if (c.status === "cancelled" || c.status === "unlisted") continue;
    if (c.open <= 0.01) continue;

    let score = 0;
    let identity = false;
    const reasons: string[] = [];

    // ── 1. The payee's name against the line and its trip. ──────────────────
    const costWords = tokens([c.item, c.notes, c.experienceTitle, c.place, c.editionLabel].filter(Boolean).join(" "));
    const hits = textHits(txWords, costWords);
    if (hits.specific.length) {
      score += Math.min(70, 35 + 15 * (hits.specific.length - 1));
      identity = true;
      reasons.push(`Names ${hits.specific.slice(0, 2).map((w) => w.toLowerCase()).join(", ")}`);
    }
    if (hits.generic.length) {
      score += Math.min(24, 12 * hits.generic.length);
      if (!hits.specific.length) reasons.push(`Mentions ${hits.generic[0].toLowerCase()}`);
    }

    // ── 2. This payee has paid for this trip or experience before. ──────────
    if (payee && c.knownCounterparties.some((k) => squash(k) === payee)) {
      score += 45;
      identity = true;
      reasons.push(`${tx.counterparty} was allocated to ${c.scope === "edition" ? "this trip" : "this experience"} before`);
    }

    // ── 3. The amount. Confirms, never decides. ─────────────────────────────
    if (Math.abs(c.open - amount) < 0.01) {
      score += 45;
      reasons.push("Exactly what the line still expects");
    } else if (c.attached > 0 && Math.abs(c.estimated - amount) < 0.01) {
      score += 30;
      reasons.push("Equals the estimate");
    } else if (c.open > 0 && Math.abs(c.open - amount) / c.open <= 0.05) {
      score += 20;
      reasons.push(`Within 5% of the €${c.open.toFixed(2)} still open`);
    } else if (amount > c.open) {
      score += 2;
      reasons.push(`€${r2(amount - c.open).toFixed(2)} more than the line still expects`);
    } else {
      score += 8;
      reasons.push(`Part of it · €${r2(c.open - amount).toFixed(2)} would stay open`);
    }

    // ── 4. Timing. A hotel is paid before the trip, not a year after it. ────
    if (c.dateStart) {
      const before = daysBetween(tx.bookedOn, c.dateStart);
      const after = c.dateEnd ? daysBetween(tx.bookedOn, c.dateEnd) : before;
      const inWindow =
        (tx.bookedOn <= c.dateStart && before <= 180) ||
        (c.dateEnd !== null && tx.bookedOn >= c.dateStart && tx.bookedOn <= c.dateEnd) ||
        (c.dateEnd !== null && tx.bookedOn > c.dateEnd && after <= 60);
      if (inWindow) score += 10;
      else if (Math.min(before, after) > 400) score -= 15;
    } else if (c.year !== null) {
      score += txYear === c.year ? 6 : -10;
    }

    // ── 5. The gentle nudge towards a trip, as a tie-breaker only. ──────────
    score += c.scope === "edition" ? 3 : c.scope === "experience_year" ? 2 : c.scope === "year" ? 1 : 0;

    /*
     * No identity, no suggestion, with one exception: exactly one open line in
     * the whole list expects precisely this figure. Two lines at the same
     * price cancel it out, which is the three-coaches case and the reason this
     * is a fallback rather than a rule.
     */
    if (!identity) {
      if (!(exactOpen.length === 1 && exactOpen[0].costId === c.costId)) continue;
      reasons.unshift("The only open cost line for exactly this amount");
      scored.push({ candidate: c, score: 40, reasons, confidence: "possible", suggestedAmount: r2(Math.min(amount, c.open)) });
      continue;
    }
    if (score <= 10) continue;
    scored.push({
      candidate: c,
      score,
      reasons,
      confidence: score >= 80 ? "strong" : "possible",
      suggestedAmount: r2(Math.min(amount, c.open)),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}
