/**
 * The § 25 Abs. 5 UStG record: one row per trip, and the arithmetic behind it.
 *
 * This exists because nothing else can produce it. Lexware states plainly that
 * its software cannot represent margin taxation, and there is no category and
 * no tax key for § 25 anywhere in it, so lexoffice is the Belegarchiv and the
 * Bankbuch and never the thing that works out the tax. The law nevertheless
 * demands separate records for each trip showing the Entgelt, the
 * Reisevorleistungen, the Bemessungsgrundlage and the split between taxable and
 * tax free. That list has to come from here.
 *
 * The arithmetic, in the order the law puts it:
 *
 *   Entgelt              what the travellers agreed to pay, gross
 *   − Reisevorleistungen what NP7 bought in from third parties FOR THIS TRIP,
 *                        gross, including any VAT on those invoices, because
 *                        § 25 Abs. 4 Satz 1 forbids deducting it even when a
 *                        German supplier shows 19% openly. That VAT is a cost,
 *                        not a claim on the tax office, and it belongs inside
 *                        the margin
 *   = Bruttomarge        the margin, still containing VAT
 *
 * Then the margin splits by where the trip was performed. A third-country trip
 * is tax free under § 25 Abs. 2, so the whole margin stands and nothing is
 * owed. An EU trip is taxable, and § 25 Abs. 3 Satz 1 says the VAT itself is
 * not part of the base, so the base is the margin divided by 1.19 and the tax
 * is the rest. On a €2,990 trip with €2,240 of pre-services that is €119.75 of
 * VAT on a €750 margin. The same trip booked at 19% of the full price would be
 * €477.39, and that gap, roughly €358 a booking, is the entire reason this file
 * is careful.
 *
 * Two rules that are easy to lose and expensive to lose:
 *
 * A NEGATIVE MARGIN IS NOT NETTED against a positive one. § 25 Abs. 5 requires
 * the margin per trip, and a trip that lost money does not reduce the tax on a
 * trip that made money. So a loss-making trip contributes zero to the base and
 * is reported separately rather than being subtracted.
 *
 * AN UNCLASSIFIED COST IS NOT ZERO. Most of the cost lines have never been
 * sorted into Reisevorleistung, Eigenleistung and Gemeinkosten, and treating
 * the unsorted pile as if it contained no travel inputs would make every margin
 * too big and every tax bill with it. Each trip therefore carries its own
 * unclassified figure, and any trip holding one is marked provisional. A
 * provisional row is a real answer, an answer that quietly rounded the unknown
 * to nothing is not.
 */

import { createAdminClient } from "@/lib/supabase";
import { classifyTerritory, type VatTerritory } from "./territory";
import { effectiveAddonStatus } from "@/lib/addons";

/** The German standard rate. Under § 25 the taxable margin is always at the
 *  Regelsteuersatz, so this is not read from company_settings.vat_rate: that
 *  column is for the standard-VAT divisions and is null on the margin side,
 *  where a `?? 0` fallback would silently produce a 0% liability. */
const VAT_RATE = 19;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A booking counts toward the Entgelt once its spot is secured by money. A
    lead is an enquiry and a reserved spot is not yet paid for, so neither is
    an agreed trip price. */
const SECURED = new Set(["confirmed", "paid", "attended"]);

export type MarginTrip = {
  editionId: string;
  trip: string;
  editionLabel: string | null;
  place: string | null;
  dateStart: string | null;
  /** Leistungsausführung: the day the trip is performed, which is the period a
      third-country margin is declared in. */
  dateEnd: string | null;
  territory: VatTerritory;
  territoryReason: string;

  travellers: number;
  /** Contract value of the secured bookings, gross. The basis for the margin. */
  entgelt: number;
  /** What has actually arrived, for reconciliation. Never the tax base. */
  received: number;

  reisevorleistungen: number;
  /** How much of the above is still an estimate rather than an invoice. */
  vorleistungenEstimated: number;
  ownService: number;
  unclassified: number;
  unclassifiedCount: number;

  bruttomarge: number;
  /** Margin exempt under § 25 Abs. 2, third-country trips. */
  steuerfrei: number;
  /** Margin subject to tax, gross, EU trips. */
  steuerpflichtigBrutto: number;
  /** Bemessungsgrundlage: the taxable margin net of the VAT inside it. */
  bemessungsgrundlage: number;
  umsatzsteuer: number;

  /** True while any figure could still move: an estimate, an unclassified cost,
      or a territory nobody has ruled on. */
  provisional: boolean;
  notes: string[];
};

export type MarginRecord = {
  from: string;
  to: string;
  trips: MarginTrip[];
  totals: {
    entgelt: number;
    reisevorleistungen: number;
    steuerfrei: number;
    steuerpflichtigBrutto: number;
    bemessungsgrundlage: number;
    umsatzsteuer: number;
    /** The margins NOT counted because their territory is unruled. */
    unklarMarge: number;
    /** Losses, listed rather than netted off. */
    negativeMarge: number;
    unclassifiedCosts: number;
    provisionalTrips: number;
  };
};

/**
 * Build the record for every trip performed in a window.
 *
 * The window is on the trip's END date, because that is when the service is
 * performed and the official form is explicit that instalments on a tax-free
 * turnover are not declared as they arrive: the whole amount goes in the period
 * the trip actually happens. An EU trip taxes earlier, on receipt of payment,
 * which is a different question and a reason the territory column matters.
 */
export async function buildMarginRecord(from: string, to: string): Promise<MarginRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // ── The trips ───────────────────────────────────────────────────────────────
  const { data: editionRows } = await db
    .from("exp_editions")
    .select("id, label, date_start, date_end, destination_id, experience_id, exp_experiences(title, destination_id)")
    .order("date_end", { ascending: true });

  type Ed = {
    id: string;
    label: string | null;
    date_start: string | null;
    date_end: string | null;
    destination_id: string | null;
    experience_id: string | null;
    exp_experiences: { title?: string; destination_id?: string } | null;
  };
  const editions = ((editionRows ?? []) as Ed[]).filter((e) => {
    // A trip with no end date falls back to its start; one with neither cannot
    // be placed in a period at all and is left out rather than guessed into one.
    const day = e.date_end ?? e.date_start;
    return !!day && day >= from && day <= to;
  });
  if (!editions.length) {
    return { from, to, trips: [], totals: emptyTotals() };
  }
  const editionIds = editions.map((e) => e.id);

  // ── Where each trip happened ────────────────────────────────────────────────
  const destIds = [
    ...new Set(editions.map((e) => e.destination_id ?? e.exp_experiences?.destination_id).filter(Boolean)),
  ] as string[];
  const destById = new Map<string, { name: string; country: string | null; region: string | null; vat_territory: string | null }>();
  if (destIds.length) {
    const { data: dests } = await db
      .from("destinations")
      .select("id, name, country, region, vat_territory")
      .in("id", destIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of (dests ?? []) as any[]) destById.set(d.id, d);
  }

  // ── Entgelt: agreed price plus billable add-ons, on secured bookings ────────
  const { data: bookingRows } = await db
    .from("exp_bookings")
    .select("id, edition_id, status, agreed_price, downpayment_received, final_payment_received")
    .in("edition_id", editionIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingRows ?? []) as any[];
  const bookingIds = bookings.map((b) => b.id);

  const addonsBy = new Map<string, number>();
  if (bookingIds.length) {
    const { data: addons } = await db
      .from("exp_booking_addons")
      .select("booking_id, price, status, notes, payment_mode")
      .in("booking_id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (addons ?? []) as any[]) {
      // The same definition the invoice engine uses: confirmed, and billed by
      // us rather than paid to the supplier on site. An add-on paid direct is
      // never NP7 turnover, so it is neither Entgelt nor a pre-service.
      if (effectiveAddonStatus(a) !== "confirmed" || a.payment_mode === "direct") continue;
      addonsBy.set(a.booking_id, (addonsBy.get(a.booking_id) ?? 0) + (Number(a.price) || 0));
    }
  }

  const receivedBy = new Map<string, number>();
  if (bookingIds.length) {
    const { data: pays } = await db
      .from("exp_payments")
      .select("booking_id, amount, direction, type, status")
      .in("booking_id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (pays ?? []) as any[]) {
      if (p.direction === "cost" || p.status !== "paid") continue;
      const signed = (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0);
      if (p.booking_id) receivedBy.set(p.booking_id, (receivedBy.get(p.booking_id) ?? 0) + signed);
    }
  }

  type Money = { entgelt: number; received: number; travellers: number; reserved: number };
  const money = new Map<string, Money>();
  for (const e of editions) money.set(e.id, { entgelt: 0, received: 0, travellers: 0, reserved: 0 });
  for (const b of bookings) {
    const m = money.get(b.edition_id);
    if (!m) continue;
    const status = String(b.status ?? "").toLowerCase();
    if (status === "lost" || status === "cancelled") continue;
    const secured = SECURED.has(status) || !!b.downpayment_received || !!b.final_payment_received;
    // Money that arrived is money that arrived, whatever the status says.
    m.received += receivedBy.get(b.id) ?? 0;
    if (!secured) {
      m.reserved += 1;
      continue;
    }
    m.entgelt += (Number(b.agreed_price) || 0) + (addonsBy.get(b.id) ?? 0);
    m.travellers += 1;
  }

  // ── Costs, by § 25 bucket, allocated to trips ───────────────────────────────
  const costs = await costsByEdition(db, editionIds);

  // ── One row per trip ────────────────────────────────────────────────────────
  const trips: MarginTrip[] = editions.map((e) => {
    const m = money.get(e.id)!;
    const c = costs.get(e.id) ?? emptyCosts();
    const notes: string[] = [];

    const destId = e.destination_id ?? e.exp_experiences?.destination_id ?? null;
    const dest = destId ? destById.get(destId) : undefined;
    const verdict = classifyTerritory({
      country: dest?.country,
      region: dest?.region,
      name: dest?.name,
      override: dest?.vat_territory,
    });

    const entgelt = r2(m.entgelt);
    const vorleistungen = r2(c.travelInput);
    const bruttomarge = r2(entgelt - vorleistungen);

    let steuerfrei = 0;
    let steuerpflichtigBrutto = 0;
    if (bruttomarge > 0) {
      if (verdict.territory === "DRITTLAND") steuerfrei = bruttomarge;
      else if (verdict.territory === "EU") steuerpflichtigBrutto = bruttomarge;
      // UNKLAR falls into neither on purpose. It is carried in the totals as
      // its own figure so the practice can see exactly what is waiting on a
      // ruling, rather than being folded into whichever column looks likelier.
    } else if (bruttomarge < 0) {
      notes.push(
        "This trip's margin is negative. § 25 Abs. 5 does not allow a loss on one trip to reduce the tax on another, so it counts as zero here and is listed separately.",
      );
    }

    const bemessungsgrundlage = r2(steuerpflichtigBrutto / (1 + VAT_RATE / 100));
    const umsatzsteuer = r2(steuerpflichtigBrutto - bemessungsgrundlage);

    if (verdict.territory === "UNKLAR") {
      notes.push(
        `Third country or EU is unruled here (${verdict.reason}). The margin is neither exempt nor taxed in this record until it is decided.`,
      );
    }
    if (c.unclassifiedCount > 0) {
      notes.push(
        `${c.unclassifiedCount} cost line${c.unclassifiedCount === 1 ? "" : "s"} worth ${c.unclassified.toFixed(2)} have not been sorted into travel input, own service or overhead. Any travel input still in there makes this margin too big.`,
      );
    }
    if (c.travelInputEstimated > 0) {
      notes.push(
        `${c.travelInputEstimated.toFixed(2)} of the travel inputs is an estimate rather than a supplier invoice, so the margin is provisional until the last invoice arrives.`,
      );
    }
    if (c.ownService > 0) {
      notes.push(
        `${c.ownService.toFixed(2)} of own services sits on this trip. It does not reduce the margin, and whether the trip price has to be split for it depends on the coaches question that is still open with the tax practice.`,
      );
    }
    if (m.reserved > 0) {
      notes.push(
        `${m.reserved} booking${m.reserved === 1 ? " is" : "s are"} on the trip but not secured by money, so ${m.reserved === 1 ? "its price is" : "their prices are"} not in the Entgelt.`,
      );
    }
    if (!destId) notes.push("This trip has no destination on file, so its territory cannot be derived at all.");

    return {
      editionId: e.id,
      trip: e.exp_experiences?.title ?? "Trip",
      editionLabel: e.label,
      place: dest?.name ?? null,
      dateStart: e.date_start,
      dateEnd: e.date_end,
      territory: verdict.territory,
      territoryReason: verdict.reason,
      travellers: m.travellers,
      entgelt,
      received: r2(m.received),
      reisevorleistungen: vorleistungen,
      vorleistungenEstimated: r2(c.travelInputEstimated),
      ownService: r2(c.ownService),
      unclassified: r2(c.unclassified),
      unclassifiedCount: c.unclassifiedCount,
      bruttomarge,
      steuerfrei: r2(steuerfrei),
      steuerpflichtigBrutto: r2(steuerpflichtigBrutto),
      bemessungsgrundlage,
      umsatzsteuer,
      provisional: c.unclassifiedCount > 0 || c.travelInputEstimated > 0 || verdict.territory === "UNKLAR",
      notes,
    };
  });

  /* A row with no travellers, no price and no costs is not a Reise, it is a
     planning option that never ran. Three of those sit in 2026 alone (the
     Malmö A/B/C variants), and a tax record padded with empty rows invites the
     reader to check each one before realising there was nothing there. Anything
     with a single euro or a single traveller on it stays, including a trip that
     was cancelled after money had been spent. */
  const kept = trips.filter(
    (t) => t.travellers > 0 || t.entgelt !== 0 || t.received !== 0 || t.reisevorleistungen !== 0 || t.unclassified !== 0 || t.ownService !== 0,
  );

  const sum = (f: (t: MarginTrip) => number) => r2(kept.reduce((s, t) => s + f(t), 0));
  return {
    from,
    to,
    trips: kept,
    totals: {
      entgelt: sum((t) => t.entgelt),
      reisevorleistungen: sum((t) => t.reisevorleistungen),
      steuerfrei: sum((t) => t.steuerfrei),
      steuerpflichtigBrutto: sum((t) => t.steuerpflichtigBrutto),
      bemessungsgrundlage: sum((t) => t.bemessungsgrundlage),
      umsatzsteuer: sum((t) => t.umsatzsteuer),
      unklarMarge: sum((t) => (t.territory === "UNKLAR" && t.bruttomarge > 0 ? t.bruttomarge : 0)),
      negativeMarge: sum((t) => (t.bruttomarge < 0 ? t.bruttomarge : 0)),
      unclassifiedCosts: sum((t) => t.unclassified),
      provisionalTrips: kept.filter((t) => t.provisional).length,
    },
  };
}

function emptyTotals(): MarginRecord["totals"] {
  return {
    entgelt: 0, reisevorleistungen: 0, steuerfrei: 0, steuerpflichtigBrutto: 0,
    bemessungsgrundlage: 0, umsatzsteuer: 0, unklarMarge: 0, negativeMarge: 0,
    unclassifiedCosts: 0, provisionalTrips: 0,
  };
}

type CostBuckets = {
  travelInput: number;
  travelInputEstimated: number;
  ownService: number;
  overhead: number;
  unclassified: number;
  unclassifiedCount: number;
};
const emptyCosts = (): CostBuckets => ({
  travelInput: 0, travelInputEstimated: 0, ownService: 0, overhead: 0, unclassified: 0, unclassifiedCount: 0,
});

/**
 * Cost buckets per trip, following the allocation rules the edition P&L already
 * uses so the two never disagree about the same euro.
 *
 * A cost with explicit allocation rows is split by those percentages and its
 * own edition_id is ignored; a cost with none falls back to its edition_id at
 * the full amount. What a cost is worth is, in order: the expense payments
 * actually attached to it, then the recorded actual, then the estimate. Only
 * the first two are money that has been invoiced, which is what makes a margin
 * final rather than provisional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function costsByEdition(db: any, editionIds: string[]): Promise<Map<string, CostBuckets>> {
  const out = new Map<string, CostBuckets>();
  for (const id of editionIds) out.set(id, emptyCosts());

  const attached = new Map<string, number>();
  const { data: cpa } = await db.from("exp_cost_payment_allocations").select("cost_id, amount");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (cpa ?? []) as any[]) attached.set(a.cost_id, (attached.get(a.cost_id) ?? 0) + (Number(a.amount) || 0));

  type Cost = {
    id: string;
    status: string | null;
    actual_amount: number | null;
    estimated_amount: number | null;
    margin_class: string | null;
  };
  const value = (c: Cost) => {
    const paid = attached.get(c.id) ?? 0;
    if (paid > 0) return { amount: paid, estimated: false };
    if (c.actual_amount != null) return { amount: Number(c.actual_amount) || 0, estimated: false };
    return { amount: Number(c.estimated_amount) || 0, estimated: true };
  };

  const add = (editionId: string, c: Cost, share: number) => {
    const b = out.get(editionId);
    if (!b) return;
    const { amount, estimated } = value(c);
    const part = amount * share;
    if (c.margin_class === "travel_input") {
      b.travelInput += part;
      if (estimated) b.travelInputEstimated += part;
    } else if (c.margin_class === "own_service") {
      b.ownService += part;
    } else if (c.margin_class === "overhead") {
      b.overhead += part;
    } else {
      b.unclassified += part;
      // Counted once per cost line, not once per share: a cost split over three
      // trips is one unsorted line, not three.
      if (share > 0) b.unclassifiedCount += 1;
    }
  };

  const allocatedCostIds = new Set<string>();
  const { data: allocs } = await db
    .from("exp_cost_allocations")
    .select("cost_id, percent, edition_id, exp_costs(id, status, actual_amount, estimated_amount, margin_class)");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (allocs ?? []) as any[]) {
    allocatedCostIds.add(a.cost_id);
    const c = a.exp_costs as Cost | null;
    if (!c || c.status === "cancelled") continue;
    if (!out.has(a.edition_id)) continue;
    add(a.edition_id, c, (Number(a.percent) || 0) / 100);
  }

  const { data: direct } = await db
    .from("exp_costs")
    .select("id, edition_id, status, actual_amount, estimated_amount, margin_class")
    .in("edition_id", editionIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (direct ?? []) as any[]) {
    if (c.status === "cancelled" || allocatedCostIds.has(c.id)) continue;
    add(c.edition_id, c as Cost, 1);
  }

  for (const b of out.values()) {
    b.travelInput = r2(b.travelInput);
    b.travelInputEstimated = r2(b.travelInputEstimated);
    b.ownService = r2(b.ownService);
    b.overhead = r2(b.overhead);
    b.unclassified = r2(b.unclassified);
  }
  return out;
}

// ─── The list itself ──────────────────────────────────────────────────────────

/**
 * The record as a CSV the tax practice can open, with a German header row,
 * German decimal commas and a semicolon separator, because that is what Excel
 * in a German locale reads without a wizard.
 */
export function marginRecordCsv(record: MarginRecord): string {
  const de = (n: number) => n.toFixed(2).replace(".", ",");
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = [
    "Reise", "Termin", "Ort", "Abreise", "Rueckreise", "Reisende",
    "Entgelt", "Reisevorleistungen", "Bruttomarge",
    "Gebiet", "Marge steuerfrei (§25 Abs.2)", "Marge steuerpflichtig brutto",
    "Bemessungsgrundlage", "Umsatzsteuer 19%",
    "davon geschaetzt", "Eigenleistung", "unklassifizierte Kosten", "Status", "Hinweise",
  ];
  const lines = [head.map(q).join(";")];
  for (const t of record.trips) {
    lines.push(
      [
        q(t.trip), q(t.editionLabel ?? ""), q(t.place ?? ""), q(t.dateStart ?? ""), q(t.dateEnd ?? ""),
        String(t.travellers),
        de(t.entgelt), de(t.reisevorleistungen), de(t.bruttomarge),
        q(t.territory), de(t.steuerfrei), de(t.steuerpflichtigBrutto),
        de(t.bemessungsgrundlage), de(t.umsatzsteuer),
        de(t.vorleistungenEstimated), de(t.ownService), de(t.unclassified),
        q(t.provisional ? "vorlaeufig" : "endgueltig"),
        q(t.notes.join(" ")),
      ].join(";"),
    );
  }
  const T = record.totals;
  lines.push(
    [
      q("Summe"), "", "", "", "", "",
      de(T.entgelt), de(T.reisevorleistungen), de(T.entgelt - T.reisevorleistungen),
      "", de(T.steuerfrei), de(T.steuerpflichtigBrutto),
      de(T.bemessungsgrundlage), de(T.umsatzsteuer),
      "", "", de(T.unclassifiedCosts),
      q(T.provisionalTrips ? `${T.provisionalTrips} vorlaeufig` : "endgueltig"),
      q(
        "Keine Verrechnung negativer mit positiven Margen (§ 25 Abs. 5). " +
        `Nicht enthalten: ${de(Math.abs(T.negativeMarge))} negative Margen, ` +
        `${de(T.unklarMarge)} Marge mit ungeklaertem Gebiet.`,
      ),
    ].join(";"),
  );
  return lines.join("\r\n");
}
