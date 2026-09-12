/**
 * GET /api/admin/exp-costs/consequence — what this cost will do, before it is
 * saved.
 *
 * The incentive to put a cost on an edition is not a nag; it is showing the
 * person what each choice means. For an edition the panel says how the trip's
 * P&L and its § 25 margin move (costs up by €X, net down by €X, Umsatzsteuer
 * down by €Y if it is a Reisevorleistung). For anything broader it says,
 * honestly, that no trip will see it until it is split by %.
 *
 * Query: scope, edition_id | experience_id + year | year, amount (the value
 * the readers will use), margin_class, exclude_id (the line being edited, so
 * its current contribution is taken out before the new one goes in).
 *
 * Read-only. The figures come from the same functions the P&L route and the
 * margin record use, so the preview cannot disagree with the pages.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess, requireAdminGate } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { buildEditionMargin, costBucketsByEdition } from "@/lib/lexoffice/margin";
import { loadCostsWithMoney } from "@/lib/finance/cost-ledger";
import { isCostScope } from "@/lib/finance/costs";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const VAT = 19;

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const access = await getRequestAccess();
  if (!access || !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const p = (k: string) => searchParams.get(k) || null;

  const scope = isCostScope(p("scope")) ? p("scope") : "edition";
  const amount = r2(Number(p("amount")) || 0);
  const cls = p("margin_class");
  const excludeId = p("exclude_id");
  const notes: string[] = [];

  // The line being edited: what it contributes today is taken out first.
  let existingValue = 0;
  let existingTravel = 0;
  let existingEditionId: string | null = null;
  if (excludeId) {
    const [row] = await loadCostsWithMoney(db, { ids: [excludeId] }).catch(() => []);
    if (row) {
      existingEditionId = row.edition_id;
      existingValue = row.money.value;
      existingTravel = row.margin_class === "travel_input" ? row.money.value : 0;
    }
  }

  if (scope !== "edition") {
    const year = Number(p("year")) || null;
    notes.push("No trip's P&L and no § 25 record will see this cost until it is split by % across editions (Split across editions, in the cost's detail).");
    if (cls === "travel_input") {
      notes.push(scope === "general"
        ? "A general cost cannot be a Reisevorleistung: it belongs to no trip. Pick a scope or another bucket."
        : "A Reisevorleistung that is on no trip is listed in the § 25 record as unassigned, so the practice can see it is missing from every margin.");
    }
    if (existingEditionId) {
      notes.push(`Moving it off its edition takes ${eur(existingValue)} out of that trip's P&L${existingTravel ? " and its Reisevorleistungen" : ""}.`);
    }
    return NextResponse.json({
      scope, amount,
      pnl: null, margin: null,
      board: year
        ? { year, applies: true, note: `Appears on the ${year} budget board as a trip cost fact${scope === "general" ? "" : ""}.` }
        : { year: null, applies: false, note: "Belongs to no year. It appears on no budget board until it gets a date or a year." },
      notes,
    });
  }

  const editionId = p("edition_id");
  if (!editionId) return NextResponse.json({ scope, amount, pnl: null, margin: null, board: null, notes: ["Pick an edition to see what this cost will do."] });

  const { data: ed } = await db
    .from("exp_editions")
    .select("id, label, year, date_start, date_end, exp_experiences(title)")
    .eq("id", editionId)
    .maybeSingle();
  if (!ed) return NextResponse.json({ error: "No such edition." }, { status: 404 });

  const [buckets, trip] = await Promise.all([
    costBucketsByEdition(db, [editionId]),
    buildEditionMargin(editionId),
  ]);
  const b = buckets.get(editionId);
  const costsNow = r2((b?.travelInput ?? 0) + (b?.ownService ?? 0) + (b?.overhead ?? 0) + (b?.unclassified ?? 0));
  const travelNow = r2(b?.travelInput ?? 0);

  // Only a line that is currently on THIS edition is taken out; one that is
  // being moved here from elsewhere simply adds.
  const takeOut = existingEditionId === editionId ? existingValue : 0;
  const takeOutTravel = existingEditionId === editionId ? existingTravel : 0;
  const costsAfter = r2(costsNow - takeOut + amount);
  const travelAfter = r2(travelNow - takeOutTravel + (cls === "travel_input" ? amount : 0));

  const received = trip?.received ?? 0;
  const entgelt = trip?.entgelt ?? 0;
  const territory = trip?.territory ?? "UNKLAR";
  const tax = (marge: number) => {
    if (marge <= 0 || territory !== "EU") return 0;
    const base = r2(marge / (1 + VAT / 100));
    return r2(marge - base);
  };
  const margeNow = r2(entgelt - travelNow);
  const margeAfter = r2(entgelt - travelAfter);

  if (cls === null || cls === "") notes.push("Unsorted: until it has a § 25 bucket the trip's margin reads provisional, and if it turns out to be a Reisevorleistung the margin is smaller than shown.");
  if (existingEditionId && existingEditionId !== editionId) notes.push(`Moving it here takes ${eur(existingValue)} out of the other trip's P&L.`);
  if (territory === "DRITTLAND") notes.push("Third-country trip: the margin is tax free under § 25 Abs. 2, so a Reisevorleistung changes the margin, not the tax.");
  if (territory === "UNKLAR") notes.push("This trip's territory is unruled, so its tax cannot be previewed.");

  return NextResponse.json({
    scope, amount,
    edition: { id: ed.id, label: ed.label, year: ed.year, title: ed.exp_experiences?.title ?? null },
    pnl: {
      before: { received: r2(received), costs: costsNow, net: r2(received - costsNow) },
      after: { received: r2(received), costs: costsAfter, net: r2(received - costsAfter) },
    },
    margin: {
      territory,
      before: { entgelt: r2(entgelt), reisevorleistungen: travelNow, bruttomarge: margeNow, umsatzsteuer: tax(margeNow) },
      after: { entgelt: r2(entgelt), reisevorleistungen: travelAfter, bruttomarge: margeAfter, umsatzsteuer: tax(margeAfter) },
    },
    board: { year: ed.year, applies: !!ed.year, note: ed.year ? `Appears on the ${ed.year} budget board as a trip cost fact.` : "The edition has no year, so the budget board cannot place it." },
    notes,
  });
}

const eur = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
