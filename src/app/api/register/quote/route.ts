import { NextRequest, NextResponse } from "next/server";
import { bookingPrice } from "@/lib/tier-perks";
import { resolveGearInfo, gearDelta, gearOptions, parseGearChoice, parseGearBaseline } from "@/lib/gear-choice";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { computePaymentPlan, mergeSameDayStages, PAYMENT_DEFAULTS } from "@/lib/payments";
import { companionPackageIssue, sumCompanionPrices, MAX_COMPANIONS } from "@/lib/group-register";

/**
 * Public payment-plan quote for the registration modal.
 *
 * Given a package (+ optional edition), returns the milestone schedule a rider
 * would be on if they registered today — computed server-side from the SAME
 * engine + config that drives the member plan and the invoices, so the promise
 * made at booking always matches what the account later shows. Prices/deposits
 * are public content (they're on the page), so no auth.
 *
 * `companions=<packageId,packageId>` quotes a GROUP. The payer's booking pools
 * everyone they bring (group-booking.ts: one plan, one invoice, all of it to
 * the payer), so a plan quoting only their own seat promises half the money
 * they will owe: the modal showed "Downpayment €1,440" beside a roster that
 * said "Total for 2 spots €7,470". The companions' prices are summed into the
 * total and the plan is computed ONCE, by the same engine, on that total.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const packageId = sp.get("packageId") || "";
  const editionId = sp.get("editionId") || "";
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: pkg }, { data: edition }] = await Promise.all([
    db.from("exp_packages")
      .select("id,price,status,deposit,deposit_refund_days,downpayment_percent,final_days_before,category,experience_id,gear_baseline")
      .eq("id", packageId).maybeSingle(),
    editionId
      ? db.from("exp_editions").select("id,experience_id,deposit,date_start,launch_discount_pct,launch_price_until").eq("id", editionId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!pkg || pkg.status !== "active") {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  // Same precedence as the member/admin views: edition deposit overrides package.
  const cfg = {
    deposit: edition?.deposit ?? pkg.deposit ?? null,
    deposit_refund_days: pkg.deposit_refund_days ?? null,
    downpayment_percent: pkg.downpayment_percent ?? null,
    final_days_before: pkg.final_days_before ?? null,
  };
  const today = new Date().toISOString().slice(0, 10);
  // Every milestone is a fraction of the total, so the discount has to land
  // here — quoting a plan off the full price contradicts the price shown.
  // Launch vs tier — the best single advantage, same resolver the booking
  // routes use, so the promise here always matches the invoice later.
  const member = await getPortalUser().catch(() => null);
  const { price: total } = await bookingPrice(db, {
    price: pkg.price ?? 0,
    experienceId: edition?.experience_id ?? "",
    editionId: editionId || null,
    packageId,
    edition,
    contactId: member?.contactId ?? null,
  });
  // Ticked booking-time extras ride the plan un-discounted (they are add-ons,
  // not the package) — same maths the booking will produce for real.
  const extraIds = (sp.get("extras") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
  let extrasTotal = 0;
  if (extraIds.length) {
    const { data: comps } = await db
      .from("exp_components")
      .select("id,sell_price,offer_at_booking,archived_at,is_global,experience_id,edition_id")
      .in("id", extraIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extrasTotal = ((comps ?? []) as any[])
      .filter((c) => c.offer_at_booking && !c.archived_at && Number(c.sell_price) > 0 &&
        (c.is_global || !edition?.experience_id || c.experience_id === edition.experience_id) &&
        // A component pinned to one week cannot be quoted against another —
        // the ids arrive from the querystring, so this is also the check that
        // stops a hand-edited URL pricing in another week's extra.
        (!c.edition_id || c.edition_id === (editionId || null)))
      .reduce((n2, c) => n2 + Number(c.sell_price), 0);
  }

  // The gear choice (Model A): rental is IN the package (±0); storage / own
  // gear quote as a delta from the governing components' sell prices.
  const baseline = parseGearBaseline(pkg.gear_baseline);
  const gearChoice = parseGearChoice(sp.get("gear") ?? baseline);
  const gearInfo = await resolveGearInfo(
    (pkg.experience_id as string | null) ?? edition?.experience_id ?? "",
    editionId || null,
    (pkg.category as string | null) ?? null,
  );
  const rentalId = sp.get("rentalId") || null;
  const gDelta = gearDelta(gearInfo, gearChoice, baseline, rentalId);

  // The group the payer is bringing. Duplicates are kept on purpose — two
  // friends may pick the same room — and every id is re-checked against this
  // experience and week, because it arrives from a querystring.
  const companionIds = (sp.get("companions") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, MAX_COMPANIONS);
  const scopeExperienceId = (pkg.experience_id as string | null) ?? edition?.experience_id ?? "";
  let companionsTotal = 0;
  let companionsCounted = 0;
  if (companionIds.length && scopeExperienceId) {
    const { data: cpkgs } = await db
      .from("exp_packages")
      .select("id,price,status,archived_at,experience_id,edition_id")
      .in("id", [...new Set(companionIds)]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map(((cpkgs ?? []) as any[]).map((p) => [p.id as string, p]));
    // One price per distinct package, then counted as often as it was chosen.
    const priced = new Map<string, number>();
    for (const [id, p] of byId) {
      if (companionPackageIssue(p, { experienceId: scopeExperienceId, editionId: editionId || null })) continue;
      // Same resolver the companion's real booking will use, minus the member
      // tier: a companion's tier hangs off THEIR contact, and at quote time
      // nobody has typed their email yet. So a launch price applies here, a
      // personal tier discount shows up later as a smaller invoice, never a
      // bigger one.
      const { price } = await bookingPrice(db, {
        price: p.price ?? 0, experienceId: scopeExperienceId, editionId: editionId || null,
        packageId: id, edition, contactId: null,
      });
      priced.set(id, price);
    }
    const summed = sumCompanionPrices(companionIds, priced);
    companionsTotal = summed.total;
    companionsCounted = summed.counted;
  }

  const groupTotal = total + extrasTotal + gDelta + companionsTotal;
  const plan = computePaymentPlan(cfg, {
    total: groupTotal,
    paidAmount: 0,
    bookedAt: today,
    editionStart: edition?.date_start ?? null,
  });

  return NextResponse.json({
    price: groupTotal,
    extrasTotal,
    /** Spots this plan covers: the payer plus every companion it could price.
     *  The modal compares it with its own roster, so a dropped id can never
     *  pass for a plan that covers everybody. */
    people: 1 + companionsCounted,
    // What the picker renders the choice from — deltas only, never raw costs.
    gear: gearOptions(gearInfo, baseline),
    deposit: cfg.deposit ?? PAYMENT_DEFAULTS.deposit,
    downpaymentPercent: cfg.downpayment_percent ?? PAYMENT_DEFAULTS.downpaymentPercent,
    refundDays: cfg.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays,
    // Merged for the quote, which is a sales surface: a late signup whose two
    // instalments land on the same day should read as one payment, not as a
    // schedule that isn't one. The invoice engine still sees both stages.
    milestones: mergeSameDayStages(plan).map((m) => ({ kind: m.kind, label: m.label, amount: m.amount, dueLabel: m.dueLabel, dueDate: m.dueDate })),
  });
}
