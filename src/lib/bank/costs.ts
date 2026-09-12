/**
 * The debit side of the ledger: a bank movement OUT, tied to the cost line it
 * paid for.
 *
 * The same two layers store.ts keeps apart for money in:
 *   bank_transactions            what the bank says left the account. Fact.
 *   exp_payments (direction=cost) what NP7 books that money as. Interpretation.
 * Allocating a debit creates the second from the first, with provenance='bank'
 * and bank_transaction_id set, and attaches it to the cost line through
 * exp_cost_payment_allocations (migration 057). From then on the line's
 * "actual" is provable: it can be walked back to a real movement.
 *
 * Partial is allowed, over-allocation is refused, one debit may feed several
 * lines and one line may be fed by several debits. Nothing is booked without
 * a click: suggestions are computed on read and never applied.
 */
import { createClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/reconcile";
import { costMoney, describeScope, isMarginClass, validateScope, type CostScope } from "@/lib/finance/costs";
import { suggestCostsForDebit, type CostCandidate, type CostMatch } from "./cost-match";
import type { BankTransactionRow } from "./types";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** A movement that can be a cost: money out, and not the bank moving its own. */
export function isCostDebit(t: { amount: number | string; kind: string; ignored_at?: string | null }): boolean {
  return Number(t.amount) < 0 && !t.ignored_at && (t.kind === "expense" || t.kind === "fee" || t.kind === "unknown");
}

// ── Candidates ───────────────────────────────────────────────────────────────

type RawCost = {
  id: string; item: string; notes: string | null; scope: CostScope; edition_id: string | null;
  experience_id: string | null; year: number | null; status: string | null; margin_class: string | null;
  unplanned: boolean; estimated_amount: number | string | null; actual_amount: number | string | null;
  actual_provenance: string | null;
  exp_experiences: { title: string; destination_id: string | null } | null;
  exp_editions: { label: string | null; year: number | null; date_start: string | null; date_end: string | null; destination_id: string | null } | null;
};

/**
 * Every cost line that could still take money, with enough context to
 * recognise its payee. Cancelled and unlisted lines are out; a line whose
 * expected amount is already fully backed is out too.
 */
export async function loadCostCandidates(): Promise<CostCandidate[]> {
  const admin = db();
  const { data: costs } = await admin
    .from("exp_costs")
    .select("id, item, notes, scope, edition_id, experience_id, year, status, margin_class, unplanned, estimated_amount, actual_amount, actual_provenance, exp_experiences(title, destination_id), exp_editions(label, year, date_start, date_end, destination_id)")
    .not("status", "in", "(cancelled,unlisted)");
  const rows = (costs ?? []) as unknown as RawCost[];
  if (!rows.length) return [];

  // What is already attached, and from where.
  const attached = new Map<string, { attached: number; bank: number }>();
  const { data: allocs } = await admin
    .from("exp_cost_payment_allocations")
    .select("cost_id, amount, payment_id, exp_payments(provenance, bank_transaction_id)");
  const paymentToCost = new Map<string, string>();
  for (const a of (allocs ?? []) as unknown as { cost_id: string; amount: number | string | null; payment_id: string; exp_payments: { provenance: string | null; bank_transaction_id: string | null } | null }[]) {
    const cur = attached.get(a.cost_id) ?? { attached: 0, bank: 0 };
    const amt = Number(a.amount) || 0;
    cur.attached = round2(cur.attached + amt);
    if (a.exp_payments?.provenance === "bank") cur.bank = round2(cur.bank + amt);
    attached.set(a.cost_id, cur);
    paymentToCost.set(a.payment_id, a.cost_id);
  }

  // Which payees have paid for which trip or experience before. A hotel that
  // was allocated to Bonaire Week I is a strong hint for Week II.
  const byEdition = new Map<string, Set<string>>();
  const byExperience = new Map<string, Set<string>>();
  if (paymentToCost.size) {
    const costById = new Map(rows.map((c) => [c.id, c]));
    const { data: pays } = await admin
      .from("exp_payments")
      .select("id, bank_transactions(counterparty)")
      .eq("direction", "cost")
      .not("bank_transaction_id", "is", null);
    for (const p of (pays ?? []) as unknown as { id: string; bank_transactions: { counterparty: string | null } | null }[]) {
      const costId = paymentToCost.get(p.id);
      const who = p.bank_transactions?.counterparty;
      if (!costId || !who) continue;
      const c = costById.get(costId);
      if (!c) continue;
      if (c.edition_id) (byEdition.get(c.edition_id) ?? byEdition.set(c.edition_id, new Set()).get(c.edition_id)!).add(who);
      if (c.experience_id) (byExperience.get(c.experience_id) ?? byExperience.set(c.experience_id, new Set()).get(c.experience_id)!).add(who);
    }
  }

  // Place names, so "TENERI" on a card slip can meet "Tenerife".
  const destIds = [...new Set(rows.map((c) => c.exp_editions?.destination_id ?? c.exp_experiences?.destination_id).filter(Boolean))] as string[];
  const placeById = new Map<string, string>();
  if (destIds.length) {
    const { data: dests } = await admin.from("destinations").select("id, name").in("id", destIds);
    for (const d of (dests ?? []) as { id: string; name: string }[]) placeById.set(d.id, d.name);
  }

  const out: CostCandidate[] = [];
  for (const c of rows) {
    const a = attached.get(c.id) ?? { attached: 0, bank: 0 };
    const money = costMoney(c, a.attached, a.bank);
    const known = new Set<string>([
      ...(c.edition_id ? byEdition.get(c.edition_id) ?? [] : []),
      ...(c.experience_id ? byExperience.get(c.experience_id) ?? [] : []),
    ]);
    const destId = c.exp_editions?.destination_id ?? c.exp_experiences?.destination_id ?? null;
    out.push({
      costId: c.id,
      item: c.item,
      notes: c.notes,
      scope: c.scope,
      scopeLabel: describeScope({
        scope: c.scope, year: c.year, experienceTitle: c.exp_experiences?.title ?? null,
        editionLabel: c.exp_editions?.label ?? null, editionYear: c.exp_editions?.year ?? null,
      }),
      editionId: c.edition_id,
      editionLabel: c.exp_editions?.label ?? null,
      experienceId: c.experience_id,
      experienceTitle: c.exp_experiences?.title ?? null,
      place: destId ? placeById.get(destId) ?? null : null,
      year: c.year ?? c.exp_editions?.year ?? null,
      dateStart: c.exp_editions?.date_start ?? null,
      dateEnd: c.exp_editions?.date_end ?? null,
      status: c.status,
      marginClass: c.margin_class,
      unplanned: !!c.unplanned,
      estimated: round2(Number(c.estimated_amount) || 0),
      actual: c.actual_amount == null ? null : round2(Number(c.actual_amount) || 0),
      attached: money.attached,
      open: money.open,
      state: money.state,
      knownCounterparties: [...known],
    });
  }
  return out;
}

// ── What a debit is already allocated to ─────────────────────────────────────

export type CostAllocationView = {
  paymentId: string;
  costId: string;
  item: string;
  scope: CostScope;
  scopeLabel: string;
  amount: number;
};

export type DebitAllocations = { allocations: CostAllocationView[]; total: number };

export async function costAllocationsForTransactions(txIds: string[]): Promise<Map<string, DebitAllocations>> {
  const out = new Map<string, DebitAllocations>();
  if (!txIds.length) return out;
  const admin = db();
  type Row = {
    id: string; amount: number | string | null; bank_transaction_id: string;
    exp_cost_payment_allocations: {
      cost_id: string; amount: number | string | null;
      exp_costs: { item: string; scope: CostScope; year: number | null; exp_experiences: { title: string } | null; exp_editions: { label: string | null; year: number | null } | null } | null;
    }[] | null;
  };
  for (let i = 0; i < txIds.length; i += 100) {
    const { data } = await admin
      .from("exp_payments")
      .select("id, amount, bank_transaction_id, exp_cost_payment_allocations(cost_id, amount, exp_costs(item, scope, year, exp_experiences(title), exp_editions(label, year)))")
      .eq("direction", "cost")
      .in("bank_transaction_id", txIds.slice(i, i + 100));
    for (const p of (data ?? []) as unknown as Row[]) {
      const cur = out.get(p.bank_transaction_id) ?? { allocations: [], total: 0 };
      for (const a of p.exp_cost_payment_allocations ?? []) {
        const c = a.exp_costs;
        const amt = round2(Number(a.amount) || 0);
        cur.allocations.push({
          paymentId: p.id,
          costId: a.cost_id,
          item: c?.item ?? "Cost line",
          scope: c?.scope ?? "edition",
          scopeLabel: c
            ? describeScope({ scope: c.scope, year: c.year, experienceTitle: c.exp_experiences?.title ?? null, editionLabel: c.exp_editions?.label ?? null, editionYear: c.exp_editions?.year ?? null })
            : "",
          amount: amt,
        });
      }
      // The payment's own amount is what the debit spent; an allocation row
      // that somehow disagrees must not make the debit look emptier than it is.
      cur.total = round2(cur.total + (Number(p.amount) || 0));
      out.set(p.bank_transaction_id, cur);
    }
  }
  return out;
}

/** Money out, allocated to costs, by scope, plus what is still unplaced. */
export type ScopeTotals = {
  byScope: Record<CostScope, number>;
  allocated: number;
  debits: number;
  unallocated: number;
  debitCount: number;
  unallocatedCount: number;
};

export async function scopeTotals(division = "experience"): Promise<ScopeTotals> {
  const admin = db();
  const byScope: Record<CostScope, number> = { edition: 0, experience_year: 0, year: 0, general: 0 };
  const { data: allocs } = await admin
    .from("exp_cost_payment_allocations")
    .select("amount, exp_costs(scope), exp_payments!inner(provenance, direction)")
    .eq("exp_payments.provenance", "bank")
    .eq("exp_payments.direction", "cost");
  let allocated = 0;
  for (const a of (allocs ?? []) as unknown as { amount: number | string | null; exp_costs: { scope: CostScope } | null }[]) {
    const amt = Number(a.amount) || 0;
    const s = a.exp_costs?.scope ?? "edition";
    byScope[s] = round2((byScope[s] ?? 0) + amt);
    allocated = round2(allocated + amt);
  }

  const { data: txs } = await admin
    .from("bank_transactions")
    .select("id, amount, kind, ignored_at")
    .eq("division", division)
    .lt("amount", 0)
    .is("ignored_at", null)
    .in("kind", ["expense", "fee", "unknown"]);
  const rows = (txs ?? []) as { id: string; amount: number | string; kind: string; ignored_at: string | null }[];
  const debits = round2(rows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0));
  const placed = await costAllocationsForTransactions(rows.map((t) => t.id));
  let unallocatedCount = 0;
  for (const t of rows) {
    const p = placed.get(t.id);
    if (!p || p.total + 0.01 < Math.abs(Number(t.amount))) unallocatedCount++;
  }
  return {
    byScope, allocated, debits,
    unallocated: round2(debits - allocated),
    debitCount: rows.length, unallocatedCount,
  };
}

// ── Suggestions on read ──────────────────────────────────────────────────────

export type DebitWithCosts = {
  costSuggestions: CostMatch[];
  costAllocations: CostAllocationView[];
  costAllocated: number;
  costRemaining: number;
};

export function withCostSuggestions<T extends BankTransactionRow>(
  txs: T[],
  candidates: CostCandidate[],
  placed: Map<string, DebitAllocations>,
): (T & DebitWithCosts)[] {
  return txs.map((t) => {
    const p = placed.get(t.id) ?? { allocations: [], total: 0 };
    const debit = isCostDebit(t);
    const remaining = debit ? round2(Math.abs(Number(t.amount)) - p.total) : 0;
    return {
      ...t,
      costAllocations: p.allocations,
      costAllocated: p.total,
      costRemaining: Math.max(0, remaining),
      costSuggestions:
        debit && remaining > 0.01
          ? suggestCostsForDebit(
              {
                amount: -remaining,
                currency: t.currency,
                counterparty: t.counterparty,
                reference: t.reference,
                label: t.label,
                bookedOn: t.booked_on,
              },
              candidates,
            )
          : [],
    };
  });
}

// ── Allocating ───────────────────────────────────────────────────────────────

export type CostAllocation = { costId: string; amount: number };

/**
 * Book a debit against one or more cost lines.
 *
 * One exp_payments row per line, all carrying the same bank_transaction_id
 * and our own reference, each attached to its line with the allocated amount.
 * The line's "actual" is then the sum of what is attached, which is the rule
 * the P&L and the § 25 record already use; no reader changes.
 *
 * Over-allocating is refused: a €3,405 debit cannot pay €4,000 of hotel.
 * Partial is allowed and the remainder is reported, so a card payment that
 * covered two lines can be placed in two clicks.
 */
export async function allocateDebitToCosts(opts: {
  transactionId: string;
  allocations: CostAllocation[];
  by: string;
  confidence: "suggested" | "manual";
}): Promise<{ ok: true; paymentIds: string[]; allocated: number; remaining: number } | { ok: false; error: string }> {
  const admin = db();

  const { data: tx } = await admin.from("bank_transactions").select("*").eq("id", opts.transactionId).maybeSingle();
  if (!tx) return { ok: false, error: "No such transaction." };
  if (tx.ignored_at) return { ok: false, error: "That transaction was set aside. Bring it back first." };
  if (Number(tx.amount) >= 0) return { ok: false, error: "Money coming in is not a cost. Match it to an invoice instead." };
  if (!["expense", "fee", "unknown"].includes(tx.kind)) {
    return { ok: false, error: `This is a ${tx.kind === "payout" ? "Stripe payout" : tx.kind === "transfer" ? "transfer between our own accounts" : tx.kind}, not a cost. Change its kind first if that is wrong.` };
  }

  const wanted = opts.allocations.filter((a) => a.costId && Number(a.amount) > 0);
  if (!wanted.length) return { ok: false, error: "Nothing to allocate." };
  if (new Set(wanted.map((a) => a.costId)).size !== wanted.length) return { ok: false, error: "The same cost line is listed twice." };

  const capacity = round2(Math.abs(Number(tx.amount)));
  const { data: existing } = await admin
    .from("exp_payments")
    .select("id, amount")
    .eq("bank_transaction_id", tx.id)
    .eq("direction", "cost");
  const already = round2((existing ?? []).reduce((n, p) => n + (Number(p.amount) || 0), 0));
  const asking = round2(wanted.reduce((n, a) => n + Number(a.amount), 0));
  if (already + asking > capacity + 0.01) {
    return {
      ok: false,
      error: `That is more than the debit holds. €${capacity.toFixed(2)} went out, €${already.toFixed(2)} is already allocated, so at most €${round2(capacity - already).toFixed(2)} is left.`,
    };
  }

  const { data: costs } = await admin
    .from("exp_costs")
    .select("id, item, status, scope, experience_id")
    .in("id", wanted.map((a) => a.costId));
  const costById = new Map((costs ?? []).map((c) => [String(c.id), c]));
  for (const a of wanted) {
    const c = costById.get(a.costId);
    if (!c) return { ok: false, error: "One of those cost lines no longer exists." };
    if (c.status === "cancelled") return { ok: false, error: `"${c.item}" is cancelled. Bring it back or pick another line.` };
  }

  const paymentIds: string[] = [];
  for (const a of wanted) {
    const cost = costById.get(a.costId)!;
    const amount = round2(Number(a.amount));
    const { data: created, error } = await admin
      .from("exp_payments")
      .insert({
        booking_id: null,
        contact_id: null,
        document_id: null,
        experience_id: cost.experience_id ?? null,
        amount,
        type: "partial",
        direction: "cost",
        status: "paid",
        method: tx.source === "stripe" ? "stripe" : "bank_transfer",
        // The bank's own id, so this row can always be walked back to the
        // movement that produced it. Shared across a split on purpose.
        reference: `${tx.source}:${tx.external_id}`,
        date: tx.booked_on,
        received_at: tx.executed_at ?? `${tx.booked_on}T12:00:00Z`,
        unmatched: false,
        bank_transaction_id: tx.id,
        // Migration 235: this euro is provable, it came off a real movement.
        provenance: "bank",
        notes: `From ${tx.source}${tx.counterparty ? ` · paid to ${tx.counterparty}` : ""} · allocated to "${cost.item}"${wanted.length > 1 ? ` · one of ${wanted.length} lines this debit paid for` : ""}`,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: `Booking against "${cost.item}": ${error?.message ?? "insert failed"}` };
    }
    const { error: linkErr } = await admin
      .from("exp_cost_payment_allocations")
      .insert({ cost_id: cost.id, payment_id: created.id, amount });
    if (linkErr) {
      // Never leave a cost payment that is attached to nothing: it would be
      // money that exists in the books and counts towards no line.
      await admin.from("exp_payments").delete().eq("id", created.id);
      return { ok: false, error: `Attaching to "${cost.item}": ${linkErr.message}` };
    }
    paymentIds.push(created.id);
  }

  const allocated = round2(already + asking);
  const fully = allocated + 0.01 >= capacity;

  // A fully placed debit leaves the "to match" pile, so it carries one of its
  // payments as the link; a partly placed one stays in the pile with its
  // remainder showing. The payments are the truth about what it paid for.
  const { error: linkErr } = await admin
    .from("bank_transactions")
    .update({
      payment_id: fully ? paymentIds[0] ?? (existing?.[0]?.id ?? null) : null,
      document_id: null,
      matched_at: fully ? new Date().toISOString() : null,
      matched_by: opts.by,
      match_confidence: opts.confidence,
    })
    .eq("id", tx.id);
  if (linkErr) return { ok: false, error: `Linking the transaction: ${linkErr.message}` };

  return { ok: true, paymentIds, allocated, remaining: round2(capacity - allocated) };
}

/**
 * A real debit that no expected line was written for.
 *
 * The line is created from the debit itself, in whatever scope the person
 * chose, status confirmed and marked unplanned, and the debit is allocated to
 * it in the same call. The expected-versus-real view can then say "this was
 * never budgeted" rather than folding it in as if it had been.
 */
export async function createCostFromDebit(opts: {
  transactionId: string;
  cost: {
    item: string;
    scope?: unknown; edition_id?: unknown; experience_id?: unknown; year?: unknown; scope_reason?: unknown;
    margin_class?: unknown;
    notes?: string | null;
  };
  amount?: number | null;
  by: string;
}): Promise<{ ok: true; costId: string; paymentIds: string[]; allocated: number; remaining: number } | { ok: false; error: string }> {
  const admin = db();
  const item = String(opts.cost.item ?? "").trim();
  if (!item) return { ok: false, error: "Give the cost a name." };

  const scoped = validateScope(opts.cost);
  if (!scoped.ok) return scoped;
  const cls = opts.cost.margin_class == null || opts.cost.margin_class === "" ? null : opts.cost.margin_class;
  if (cls !== null && !isMarginClass(cls)) return { ok: false, error: `"${String(cls)}" is not one of the three § 25 buckets.` };
  if (cls === "travel_input" && scoped.row.scope === "general") {
    return { ok: false, error: "A general cost cannot be a Reisevorleistung: a travel input is bought for a trip. Give it a scope or another bucket." };
  }

  const { data: tx } = await admin.from("bank_transactions").select("id, amount, booked_on, kind, ignored_at, counterparty").eq("id", opts.transactionId).maybeSingle();
  if (!tx) return { ok: false, error: "No such transaction." };
  if (!isCostDebit(tx)) return { ok: false, error: "Only money going out can become a cost." };

  const { data: existing } = await admin
    .from("exp_payments").select("amount").eq("bank_transaction_id", tx.id).eq("direction", "cost");
  const already = round2((existing ?? []).reduce((n, p) => n + (Number(p.amount) || 0), 0));
  const remaining = round2(Math.abs(Number(tx.amount)) - already);
  const amount = opts.amount == null ? remaining : round2(Number(opts.amount));
  if (!(amount > 0)) return { ok: false, error: "Nothing left of this debit to allocate." };

  const { data: created, error } = await admin
    .from("exp_costs")
    .insert({
      item,
      ...scoped.row,
      status: "confirmed",
      unplanned: true,
      estimated_amount: null,
      actual_amount: null,
      date: tx.booked_on,
      notes: opts.cost.notes?.trim() || `Created from the bank debit${tx.counterparty ? ` to ${tx.counterparty}` : ""} on ${tx.booked_on}. No expected line existed for it.`,
      margin_class: cls,
      margin_class_note: cls ? "Sorted when the bank debit was allocated" : null,
      margin_class_at: cls ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: `Creating the cost line: ${error?.message ?? "insert failed"}` };

  const res = await allocateDebitToCosts({
    transactionId: tx.id,
    allocations: [{ costId: created.id, amount }],
    by: opts.by,
    confidence: "manual",
  });
  if (!res.ok) {
    // The line only existed to carry this debit; without it, it is noise.
    await admin.from("exp_costs").delete().eq("id", created.id);
    return res;
  }
  return { ...res, costId: created.id };
}

/**
 * Undo an allocation, mirroring unmatch() in store.ts.
 *
 * Only payments this allocator created are deleted, recognised by carrying
 * our own bank reference; their attachment rows go with them (cascade). With
 * a costId only that line's allocation is undone and the rest stays. An
 * unplanned line left with nothing attached is deleted too: it was created
 * from the debit and has no other reason to exist.
 */
export async function unallocateDebit(transactionId: string, costId?: string | null): Promise<{ ok: boolean; error?: string }> {
  const admin = db();
  const { data: tx } = await admin.from("bank_transactions").select("*").eq("id", transactionId).maybeSingle();
  if (!tx) return { ok: false, error: "No such transaction." };

  const { data: pays } = await admin
    .from("exp_payments")
    .select("id, reference, exp_cost_payment_allocations(cost_id)")
    .eq("bank_transaction_id", transactionId)
    .eq("direction", "cost");
  const ours = `${tx.source}:${tx.external_id}`;
  const touchedCosts = new Set<string>();
  let remaining = 0;
  for (const p of (pays ?? []) as unknown as { id: string; reference: string | null; exp_cost_payment_allocations: { cost_id: string }[] | null }[]) {
    const costIds = (p.exp_cost_payment_allocations ?? []).map((a) => a.cost_id);
    const mine = !costId || costIds.includes(costId);
    if (!mine) { remaining++; continue; }
    for (const c of costIds) touchedCosts.add(c);
    if (p.reference === ours) await admin.from("exp_payments").delete().eq("id", p.id);
    else {
      await admin.from("exp_cost_payment_allocations").delete().eq("payment_id", p.id);
      await admin.from("exp_payments").update({ bank_transaction_id: null }).eq("id", p.id);
    }
  }

  // An unplanned line that was created for this debit and now carries
  // nothing is removed with it.
  for (const c of touchedCosts) {
    const { data: row } = await admin.from("exp_costs").select("id, unplanned").eq("id", c).maybeSingle();
    if (!row?.unplanned) continue;
    const { count } = await admin.from("exp_cost_payment_allocations").select("id", { count: "exact", head: true }).eq("cost_id", c);
    if ((count ?? 0) === 0) await admin.from("exp_costs").delete().eq("id", c);
  }

  await admin.from("bank_transactions")
    .update(remaining
      ? { payment_id: null, matched_at: null }
      : { payment_id: null, document_id: null, matched_at: null, matched_by: null, match_confidence: null })
    .eq("id", transactionId);
  return { ok: true };
}
