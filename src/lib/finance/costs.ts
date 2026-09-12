/**
 * What a cost line IS, said once so every reader agrees.
 *
 * Pure: no database, no Next. The costs page, the bank page, the P&L, the
 * § 25 record and the budget board all import from here, and the smoke script
 * tests these functions against real rows without touching anything.
 *
 * Two questions, answered separately because they are separate:
 *
 *   WHERE does the cost belong?   scope  (migration 240)
 *   IS its money real?            state  (derived, never stored)
 */

// ── Scope ─────────────────────────────────────────────────────────────────────

export type CostScope = "edition" | "experience_year" | "year" | "general";

export const COST_SCOPES: { key: CostScope; label: string; short: string; blurb: string }[] = [
  {
    key: "edition",
    label: "One trip",
    short: "Edition",
    blurb: "Counts in that trip's P&L and in its § 25 margin record. The default, and the one every report understands.",
  },
  {
    key: "experience_year",
    label: "Shared across an experience's trips in one year",
    short: "Experience · year",
    blurb: "A coach's flight that covers three Bonaire weeks. Reaches the trips only once it is split by %.",
  },
  {
    key: "year",
    label: "A whole year, no single experience",
    short: "Year",
    blurb: "Gear for the 2027 season. Shows on the budget board for that year; reaches no trip until split.",
  },
  {
    key: "general",
    label: "General, belongs to nothing in particular",
    short: "General",
    blurb: "Office, software, the accountant. Never a Reisevorleistung, never on a trip.",
  },
];

export const SCOPE_LABEL: Record<CostScope, string> = Object.fromEntries(
  COST_SCOPES.map((s) => [s.key, s.short]),
) as Record<CostScope, string>;

export function isCostScope(v: unknown): v is CostScope {
  return v === "edition" || v === "experience_year" || v === "year" || v === "general";
}

export type ScopeRow = {
  scope: CostScope;
  edition_id: string | null;
  experience_id: string | null;
  year: number | null;
  scope_reason: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v : null);
const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

/**
 * Normalise what a form or an API body says about where a cost belongs, and
 * refuse anything the database would refuse, with a sentence a person can act
 * on rather than a constraint name.
 *
 * The same rules as migration 240's CHECKs, expressed once more here so the
 * page can say "pick an edition" before the round trip rather than after it.
 * An edition cost may arrive without its experience_id: the trigger fills it
 * from the edition, and refuses a wrong one.
 */
export function validateScope(input: {
  scope?: unknown; edition_id?: unknown; experience_id?: unknown; year?: unknown; scope_reason?: unknown;
}): { ok: true; row: ScopeRow } | { ok: false; error: string } {
  const scope: CostScope = isCostScope(input.scope) ? input.scope : "edition";
  const edition = uuidOrNull(input.edition_id);
  const experience = uuidOrNull(input.experience_id);
  const year = intOrNull(input.year);
  const reason = typeof input.scope_reason === "string" ? input.scope_reason.trim() : "";

  if (year !== null && (year < 2000 || year > 2100)) return { ok: false, error: `${year} is not a year this business will see.` };

  if (scope === "edition") {
    if (!edition) return { ok: false, error: "Pick the edition this cost belongs to, or choose a broader scope and say why." };
    return { ok: true, row: { scope, edition_id: edition, experience_id: experience, year: null, scope_reason: null } };
  }
  if (!reason) {
    return { ok: false, error: "A cost that is not one trip's needs a short reason (why not an edition?). It is kept beside the cost." };
  }
  if (scope === "experience_year") {
    if (!experience) return { ok: false, error: "Shared across an experience: pick which experience." };
    if (year === null) return { ok: false, error: "Shared across an experience: say which year." };
    return { ok: true, row: { scope, edition_id: null, experience_id: experience, year, scope_reason: reason } };
  }
  if (scope === "year") {
    if (year === null) return { ok: false, error: "A yearly cost needs its year." };
    return { ok: true, row: { scope, edition_id: null, experience_id: null, year, scope_reason: reason } };
  }
  return { ok: true, row: { scope: "general", edition_id: null, experience_id: null, year: null, scope_reason: reason } };
}

/** "Bonaire · Week I · 2026", "Alaçatı · 2027", "2027", "General". */
export function describeScope(c: {
  scope: string | null | undefined;
  year?: number | null;
  experienceTitle?: string | null;
  editionLabel?: string | null;
  editionYear?: number | null;
}): string {
  const place = (c.experienceTitle ?? "").replace(/^NP7\s+(Experience\s+)?/i, "").replace(/\s+Experience$/i, "").trim();
  switch (c.scope) {
    case "experience_year": return [place || "Experience", c.year].filter(Boolean).join(" · ");
    case "year": return c.year ? `${c.year}` : "Year";
    case "general": return "General";
    default: {
      const ed = c.editionLabel && c.editionYear != null && !c.editionLabel.includes(String(c.editionYear))
        ? `${c.editionLabel} · ${c.editionYear}`
        : c.editionLabel ?? (c.editionYear != null ? String(c.editionYear) : "");
      return [place, ed].filter(Boolean).join(" · ") || "Edition";
    }
  }
}

// ── Money: is the actual real? ────────────────────────────────────────────────

/**
 * expected  nothing but the estimate.
 * real      bank-backed: a debit from bank_transactions is attached to this
 *           line through exp_cost_payment_allocations (exp_payments with
 *           provenance = 'bank').
 * hand      a number a person typed (actual_amount), or an attached payment
 *           that was itself typed rather than imported.
 */
export type CostState = "expected" | "real" | "hand";

export type CostMoney = {
  state: CostState;
  /**
   * The figure every reader uses, in the order they all agree on: money
   * attached to the line, else the typed actual, else the estimate. Changing
   * this order here would move the P&L, the margin record and the board at
   * once, which is the point of having it in one place.
   */
  value: number;
  /** True when `value` is the estimate, i.e. nothing real is known yet. */
  estimated: boolean;
  /** Everything attached, whatever its provenance. */
  attached: number;
  /** The part of `attached` that came off a real bank movement. */
  attachedBank: number;
  /** What is still not backed by attached money: the amount a debit could
   *  still be allocated against. */
  open: number;
  provenance: "bank" | "off_bank" | "unverified" | null;
  /**
   * A zero typed into actual_amount on a row that is still an estimate.
   * Sixteen Notion-era rows carry this, and every reader counts them at zero.
   * Flagged so the page can say so; never silently repaired, because that
   * would change a figure.
   */
  zeroActualOnEstimate: boolean;
};

export type CostMoneyRow = {
  estimated_amount: number | string | null;
  actual_amount: number | string | null;
  actual_provenance?: string | null;
  status?: string | null;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function costMoney(c: CostMoneyRow, attached = 0, attachedBank = 0): CostMoney {
  const est = num(c.estimated_amount);
  const hasActual = c.actual_amount !== null && c.actual_amount !== undefined && c.actual_amount !== "";
  const act = hasActual ? num(c.actual_amount) : null;
  const att = r2(attached);
  const attBank = r2(Math.min(attachedBank, att));

  const value = att > 0 ? att : act !== null ? act : est;
  const state: CostState = attBank > 0 ? "real" : att > 0 || act !== null ? "hand" : "expected";
  const basis = act !== null ? act : est;

  let provenance: CostMoney["provenance"] = null;
  if (state === "real") provenance = "bank";
  else if (state === "hand") {
    provenance = c.actual_provenance === "off_bank" || c.actual_provenance === "unverified"
      ? c.actual_provenance
      : "unverified";
  }

  return {
    state,
    value: r2(value),
    estimated: state === "expected",
    attached: att,
    attachedBank: attBank,
    open: r2(Math.max(0, basis - att)),
    provenance,
    zeroActualOnEstimate: act === 0 && (c.status ?? "estimate") === "estimate",
  };
}

export const COST_STATE_LABEL: Record<CostState, string> = {
  expected: "Expected",
  real: "Real",
  hand: "Recorded by hand",
};

// ── § 25 bucket suggestion, from the bookkeeping plan (PDF page 8) ───────────

export type MarginClass = "travel_input" | "own_service" | "overhead";

export const MARGIN_CLASSES: { key: MarginClass; label: string; blurb: string }[] = [
  { key: "travel_input", label: "Reisevorleistung", blurb: "Bought from a third party, delivered straight to the guest. Reduces the margin." },
  { key: "own_service", label: "Eigenleistung", blurb: "NP7 does it itself: own coaches, own gear, Nico's own trip. Does not reduce the margin." },
  { key: "overhead", label: "Gemeinkosten", blurb: "Belongs to no trip: office, software, the accountant. Stays out of the margin." },
];

export function isMarginClass(v: unknown): v is MarginClass {
  return v === "travel_input" || v === "own_service" || v === "overhead";
}

/*
 * The question on page 8 of the plan: "kommt die Leistung von einem Dritten
 * und direkt beim Gast an?"
 *
 *   JA    Hotel, Flüge und Transfers der Gäste, Verpflegung, Windsurf-Center,
 *         Materialmiete, Ausflüge, eingekaufte selbständige Coaches.
 *   NEIN  Eigene NP7-Coaches und Angestellte, eigenes Material, Nicos eigene
 *         Dienstreise. Eigenleistung.
 *   3     Büro, Miete, Telefon, Software, Steuerberater, Versicherungen,
 *         Marketing, Löhne. Gemeinkosten.
 *
 * Own markers are checked first, because "Team accommodation" is a hotel
 * bill and still not a Reisevorleistung: it is NP7 sleeping there, not the
 * guest. A suggestion is a suggestion; the person presses the bucket.
 */
const OWN: [RegExp, string][] = [
  [/\bnico\b/i, "Nico's own"],
  [/\(own\)|\bown\b/i, "marked as own"],
  [/\bteam\b|\bstaff\b|employee|angestellt/i, "NP7's own people"],
  [/camera|video|photo|film/i, "own media work"],
  // The hours-log rows on a trip. Migration 237 files them as own service.
  [/^labour\b/i, "staff time on a trip"],
];
const OVERHEAD: [RegExp, string][] = [
  // The administrative hours-log rows, and their Notion-era cousins with a
  // capital L that 237's case-sensitive LIKE walked past. Same rule: staff
  // time was bought from nobody, and admin time belongs to no trip.
  [/^overhead labour|^administration\b|\badmin\b/i, "administrative staff time"],
  [/software|subscription|saas|notion|vercel|supabase|anthropic|hosting|domain/i, "software"],
  [/insurance|versicherung/i, "insurance"],
  [/marketing|\bads\b|meta ads|instagram|advert/i, "marketing"],
  [/\boffice\b|büro|buero|\bmiete\b|office rent/i, "office"],
  [/\btax\b|steuer|accountant|buchhalt|lexoffice|finanzamt/i, "tax and accounting"],
  // Not a bare "fee": a coach's fee is a coach bought in, not a bank charge.
  [/bank fee|account fee|qonto|stripe fee|card fee|gebühr|gebuehr/i, "a bank or card fee"],
  [/legal|lawyer|anwalt|notar/i, "legal"],
];
const TRAVEL: [RegExp, string][] = [
  [/hotel|accommodation|\bacco\b|lodge|villa|\broom\b|apartment|airbnb|resort/i, "guest accommodation"],
  [/transfer|shuttle|taxi|ferry|boat/i, "guest transfer"],
  [/lunch|dinner|breakfast|\bfood\b|catering|meal|verpflegung/i, "guest food"],
  [/gear|rental|\brent\b|material|equipment/i, "gear rental"],
  [/\bcenter\b|\bcentre\b|surfcenter|windsurf/i, "the windsurf centre"],
  [/excursion|\btrips?\b|\btour\b|ausflug/i, "an excursion"],
  [/external coach|guest coach|local coach|freelance coach|coach fee|\bcoach\b/i, "a coach bought in"],
  [/flight/i, "flights"],
  [/\bref\b|entry|permit|licen[cs]e/i, "a bought-in service"],
];

export function suggestMarginClass(
  item: string | null | undefined,
  notes: string | null | undefined,
  scope: string | null | undefined,
): { cls: MarginClass; reason: string } | null {
  const text = `${item ?? ""} ${notes ?? ""}`.trim();
  if (!text) return null;
  // Nothing general can be a Reisevorleistung: it belongs to no trip.
  if (scope === "general") {
    const hit = OVERHEAD.find(([re]) => re.test(text)) ?? OWN.find(([re]) => re.test(text));
    return { cls: hit && OWN.includes(hit) ? "own_service" : "overhead", reason: hit ? hit[1] : "a general cost belongs to no trip" };
  }
  for (const [re, why] of OWN) if (re.test(text)) return { cls: "own_service", reason: why };
  for (const [re, why] of OVERHEAD) if (re.test(text)) return { cls: "overhead", reason: why };
  for (const [re, why] of TRAVEL) if (re.test(text)) return { cls: "travel_input", reason: why };
  return null;
}
