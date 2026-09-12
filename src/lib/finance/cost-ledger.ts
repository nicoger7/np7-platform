/**
 * Cost lines with their money worked out.
 *
 * The only place that joins exp_costs to what is attached to it, so the list
 * page, the consequence panel and the bank page all see the same value and
 * the same state for the same line. The arithmetic itself is in costs.ts and
 * pure; this file only knows which tables to ask.
 */
import { costMoney, describeScope, suggestMarginClass, type CostMoney, type CostScope, type MarginClass } from "./costs";

export type CostRow = {
  id: string;
  item: string;
  notes: string | null;
  status: string | null;
  date: string | null;
  scope: CostScope;
  year: number | null;
  scope_reason: string | null;
  edition_id: string | null;
  experience_id: string | null;
  component_id: string | null;
  estimated_amount: number | string | null;
  actual_amount: number | string | null;
  actual_provenance: string | null;
  actual_note: string | null;
  unplanned: boolean;
  margin_class: string | null;
  margin_class_note: string | null;
  margin_class_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  exp_experiences: { id: string; title: string } | null;
  exp_editions: { id: string; label: string | null; year: number | null; date_start: string | null; date_end: string | null } | null;
};

export type CostWithMoney = CostRow & {
  money: CostMoney;
  /** "Tenerife · Week I · 2026", "Alaçatı · 2027", "2027", "General". */
  scopeText: string;
  /** Which § 25 bucket the bookkeeping plan's rule would put an unsorted line in. */
  suggested: { cls: MarginClass; reason: string } | null;
};

export const COST_SELECT =
  "*, exp_experiences(id, title), exp_editions(id, label, year, date_start, date_end)";

/**
 * The database refuses an incoherent row with a constraint name. The person
 * at the screen needs the sentence behind it.
 */
export function friendlyCostError(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("exp_costs_scope_needs_reason")) return "A cost that is not one trip's needs a short reason (why not an edition?).";
  if (m.includes("exp_costs_scope_coherent")) return "That scope does not fit the edition, experience and year given. An edition cost needs its edition; a shared cost needs an experience and a year; a yearly cost needs only a year; a general cost needs none of them.";
  if (m.includes("exp_costs_travel_input_needs_trip")) return "A general cost cannot be a Reisevorleistung: a travel input is bought for a trip. Give it a scope or another bucket.";
  if (m.includes("exp_costs_off_bank_needs_note")) return "An actual recorded off the bank needs a note saying where the number comes from.";
  if (m.includes("exp_costs_actual_has_provenance")) return "A typed actual needs a provenance; an untyped one cannot have one.";
  if (m.includes("exp_costs_status_check")) return "Status must be estimate, confirmed, cancelled or unlisted.";
  if (m.includes("exp_costs_year_sane")) return "That is not a year this business will see.";
  if (m.startsWith("exp_costs: edition")) return m; // the guard already speaks in sentences
  return m || "That did not save.";
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Σ attached per cost, and how much of that is bank-backed.
 *
 * One query over the allocation table with the payment's provenance embedded.
 * Pass cost ids to narrow it; without them it reads every allocation, which is
 * what the list page and the margin record want anyway.
 */
export async function attachedByCost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  costIds?: string[],
): Promise<Map<string, { attached: number; bank: number }>> {
  const out = new Map<string, { attached: number; bank: number }>();
  const add = (rows: { cost_id: string; amount: number | string | null; exp_payments: { provenance: string | null } | null }[] | null) => {
    for (const a of rows ?? []) {
      const cur = out.get(a.cost_id) ?? { attached: 0, bank: 0 };
      const amt = Number(a.amount) || 0;
      cur.attached = r2(cur.attached + amt);
      if (a.exp_payments?.provenance === "bank") cur.bank = r2(cur.bank + amt);
      out.set(a.cost_id, cur);
    }
  };
  const select = "cost_id, amount, exp_payments(provenance)";
  if (!costIds) {
    const { data } = await db.from("exp_cost_payment_allocations").select(select);
    add(data);
    return out;
  }
  // Chunked: `.in()` becomes a query string, and a few hundred uuids in one
  // URL is exactly the request that fails silently (see bank/store.ts).
  for (let i = 0; i < costIds.length; i += 100) {
    const { data } = await db
      .from("exp_cost_payment_allocations")
      .select(select)
      .in("cost_id", costIds.slice(i, i + 100));
    add(data);
  }
  return out;
}

export function withMoney(rows: CostRow[], attached: Map<string, { attached: number; bank: number }>): CostWithMoney[] {
  return rows.map((c) => {
    const a = attached.get(c.id) ?? { attached: 0, bank: 0 };
    return {
      ...c,
      money: costMoney(c, a.attached, a.bank),
      scopeText: describeScope({
        scope: c.scope,
        year: c.year,
        experienceTitle: c.exp_experiences?.title ?? null,
        editionLabel: c.exp_editions?.label ?? null,
        editionYear: c.exp_editions?.year ?? null,
      }),
      suggested: c.margin_class ? null : suggestMarginClass(c.item, c.notes, c.scope),
    };
  });
}

export async function loadCostsWithMoney(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  filter: { experienceId?: string | null; editionId?: string | null; scope?: string | null; status?: string | null; ids?: string[] } = {},
): Promise<CostWithMoney[]> {
  let q = db.from("exp_costs").select(COST_SELECT).order("date", { ascending: false, nullsFirst: false });
  if (filter.experienceId) q = q.eq("experience_id", filter.experienceId);
  if (filter.editionId) q = q.eq("edition_id", filter.editionId);
  if (filter.scope) q = q.eq("scope", filter.scope);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.ids) q = q.in("id", filter.ids.slice(0, 200));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CostRow[];
  const attached = await attachedByCost(db, rows.length <= 200 ? rows.map((r) => r.id) : undefined);
  return withMoney(rows, attached);
}
