import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { loadCostsWithMoney, withMoney, COST_SELECT, friendlyCostError, type CostRow } from "@/lib/finance/cost-ledger";
import { buildCostWrite } from "@/lib/finance/cost-write";

/**
 * GET /api/admin/exp-costs — every cost line with its money worked out.
 *
 * Returns an ARRAY, because the edition page's Costs tab has always read it
 * as one. Each row additionally carries `money` (state, value, attached,
 * open), `scopeText` and, for an unsorted line, the § 25 bucket the
 * bookkeeping rule would suggest.
 *
 * Filters: experience_id, edition_id, scope, status, year, state
 * (expected | real | hand), margin_class (a bucket, or "unsorted"), unplanned.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const p = (k: string) => searchParams.get(k) || null;

  let rows;
  try {
    rows = await loadCostsWithMoney(db, {
      experienceId: p("experience_id"),
      editionId: p("edition_id"),
      scope: p("scope"),
      status: p("status"),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const year = Number(p("year")) || null;
  const state = p("state");
  const cls = p("margin_class");
  const unplanned = p("unplanned");

  const out = rows.filter((c) => {
    if (year) {
      const y = c.scope === "edition" ? c.exp_editions?.year ?? null : c.year;
      if (y !== year) return false;
    }
    if (state && c.money.state !== state) return false;
    if (cls === "unsorted" ? c.margin_class !== null : cls ? c.margin_class !== cls : false) return false;
    if (unplanned === "1" && !c.unplanned) return false;
    return true;
  });
  return NextResponse.json(out);
}

/** POST — a new cost line. Scope and provenance are validated here with a
 *  sentence, and again by the database with a constraint. */
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });

  const built = buildCostWrite(body, null);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await db.from("exp_costs").insert(built.row).select(COST_SELECT).single();
  if (error) return NextResponse.json({ error: friendlyCostError(error.message) }, { status: 400 });
  const [row] = withMoney([data as CostRow], new Map());
  return NextResponse.json(row, { status: 201 });
}
