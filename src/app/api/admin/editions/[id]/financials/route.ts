import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Pipeline statuses that count as a "confirmed" head:
// fully committed (paid / confirmed / attended) + anyone who has paid the
// downpayment (downpayment_paid → create_invoice are post-deposit stages).
const CONFIRMED_STATUSES = [
  "downpayment_paid",
  "create_invoice",
  "paid",
  "confirmed",
  "attended",
];

// GET /api/admin/editions/:id/financials
// Estimated business case for an edition, derived from package component
// margins (sell − cost per person) × confirmed heads, minus edition overhead.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // 1. Edition basics. Select * so this keeps working whether or not the
  // template-cleanup migration (which adds edition currency/total_fixed_costs)
  // has been applied — missing columns simply come back undefined.
  const { data: edition, error: edErr } = await db
    .from("exp_editions")
    .select("*, exp_experiences(currency)")
    .eq("id", id)
    .single();
  if (edErr) {
    return NextResponse.json({ error: edErr.message }, { status: 404 });
  }
  const currency = edition.currency || edition.exp_experiences?.currency || "EUR";

  // 2. Packages for this edition
  const { data: packages } = await db
    .from("exp_packages")
    .select("id, name, price")
    .eq("edition_id", id);
  const pkgs: { id: string; name: string; price: number | null }[] = packages || [];
  const pkgIds = pkgs.map((p) => p.id);

  // 3. Package → component links (quantities)
  let links: { package_id: string; component_id: string; quantity: number | null }[] = [];
  if (pkgIds.length) {
    const { data } = await db
      .from("exp_package_components")
      .select("package_id, component_id, quantity")
      .in("package_id", pkgIds);
    links = data || [];
  }

  // 4. Components referenced by those links (buy + sell)
  const compIds = Array.from(new Set(links.map((l) => l.component_id)));
  const compMap = new Map<string, { unit_cost: number; sell_price: number }>();
  if (compIds.length) {
    const { data: comps } = await db
      .from("exp_components")
      .select("id, unit_cost, sell_price")
      .in("id", compIds);
    for (const c of comps || []) {
      compMap.set(c.id, {
        unit_cost: Number(c.unit_cost) || 0,
        sell_price: Number(c.sell_price) || 0,
      });
    }
  }

  // 5. Per-package cost/sell per person, rolled up from components
  const pkgStats = pkgs.map((p) => {
    let cost_pp = 0;
    let sell_pp = 0;
    let componentCount = 0;
    for (const l of links.filter((x) => x.package_id === p.id)) {
      const c = compMap.get(l.component_id);
      if (!c) continue;
      const qty = Number(l.quantity) || 1;
      cost_pp += c.unit_cost * qty;
      sell_pp += c.sell_price * qty;
      componentCount += 1;
    }
    return {
      id: p.id,
      name: p.name,
      retail_price: p.price != null ? Number(p.price) : null,
      cost_pp,
      sell_pp,
      margin_pp: sell_pp - cost_pp,
      componentCount,
    };
  });
  const pkgStatsById = new Map(pkgStats.map((s) => [s.id, s]));

  // Portfolio averages (fallback for bookings with no/unknown package)
  const withComps = pkgStats.filter((s) => s.componentCount > 0);
  const portfolioAvgSell = withComps.length
    ? withComps.reduce((a, s) => a + s.sell_pp, 0) / withComps.length
    : 0;
  const portfolioAvgCost = withComps.length
    ? withComps.reduce((a, s) => a + s.cost_pp, 0) / withComps.length
    : 0;

  // 6. Bookings → confirmed heads
  const { data: bookingRows } = await db
    .from("exp_bookings")
    .select("id, status, package_id")
    .eq("edition_id", id);
  const bookings: { id: string; status: string; package_id: string | null }[] =
    bookingRows || [];
  const confirmed = bookings.filter((b) => CONFIRMED_STATUSES.includes(b.status));

  let confRevenue = 0;
  let confCost = 0;
  const perPackageConfirmed = new Map<string, number>();
  for (const b of confirmed) {
    const s = b.package_id ? pkgStatsById.get(b.package_id) : undefined;
    const sell = s ? s.sell_pp : portfolioAvgSell;
    const cost = s ? s.cost_pp : portfolioAvgCost;
    confRevenue += sell;
    confCost += cost;
    if (b.package_id) {
      perPackageConfirmed.set(b.package_id, (perPackageConfirmed.get(b.package_id) || 0) + 1);
    }
  }
  const confHeads = confirmed.length;

  // 7. Overhead = edition costs (estimated) + template-level fixed costs
  const { data: costRows } = await db
    .from("exp_costs")
    .select("item, estimated_amount, actual_amount, status")
    .eq("edition_id", id);
  const costs: { item: string; estimated_amount: number | null; status: string | null }[] =
    (costRows || []).filter((c: { status: string | null }) => c.status !== "cancelled");
  const costsTotal = costs.reduce((a, c) => a + (Number(c.estimated_amount) || 0), 0);
  const fixedCosts = Number(edition.total_fixed_costs) || 0;
  const overheadTotal = costsTotal + fixedCosts;

  // 8. Confirmed business case
  const confirmedCase = {
    heads: confHeads,
    revenue: round(confRevenue),
    variable_cost: round(confCost),
    gross_margin: round(confRevenue - confCost),
    overhead: round(overheadTotal),
    profit: round(confRevenue - confCost - overheadTotal),
  };

  // 9. Sell-out projection at max_spots
  const avgSellHead = confHeads > 0 ? confRevenue / confHeads : portfolioAvgSell;
  const avgCostHead = confHeads > 0 ? confCost / confHeads : portfolioAvgCost;
  let capacityCase = null;
  if (edition.max_spots != null && edition.max_spots > 0) {
    const heads = edition.max_spots;
    const revenue = avgSellHead * heads;
    const variable = avgCostHead * heads;
    capacityCase = {
      heads,
      revenue: round(revenue),
      variable_cost: round(variable),
      gross_margin: round(revenue - variable),
      overhead: round(overheadTotal),
      profit: round(revenue - variable - overheadTotal),
    };
  }

  return NextResponse.json({
    currency,
    confirmed_statuses: CONFIRMED_STATUSES,
    confirmed: confirmedCase,
    capacity: capacityCase,
    packages: pkgStats
      .map((s) => ({
        id: s.id,
        name: s.name,
        cost_pp: round(s.cost_pp),
        sell_pp: round(s.sell_pp),
        margin_pp: round(s.margin_pp),
        confirmed_count: perPackageConfirmed.get(s.id) || 0,
        component_count: s.componentCount,
      }))
      .sort((a, b) => b.confirmed_count - a.confirmed_count),
    overhead: {
      items: costs.map((c) => ({ item: c.item, amount: round(Number(c.estimated_amount) || 0) })),
      fixed_costs: round(fixedCosts),
      total: round(overheadTotal),
    },
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
