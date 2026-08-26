import { NextRequest, NextResponse } from "next/server";
import { bookingPrice } from "@/lib/tier-perks";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { computePaymentPlan, PAYMENT_DEFAULTS } from "@/lib/payments";

/**
 * Public payment-plan quote for the registration modal.
 *
 * Given a package (+ optional edition), returns the milestone schedule a rider
 * would be on if they registered today — computed server-side from the SAME
 * engine + config that drives the member plan and the invoices, so the promise
 * made at booking always matches what the account later shows. Prices/deposits
 * are public content (they're on the page), so no auth.
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
      .select("id,price,status,deposit,deposit_refund_days,downpayment_percent,final_days_before")
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
      .select("id,sell_price,offer_at_booking,archived_at,is_global,experience_id")
      .in("id", extraIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extrasTotal = ((comps ?? []) as any[])
      .filter((c) => c.offer_at_booking && !c.archived_at && Number(c.sell_price) > 0 &&
        (c.is_global || !edition?.experience_id || c.experience_id === edition.experience_id))
      .reduce((n2, c) => n2 + Number(c.sell_price), 0);
  }

  const plan = computePaymentPlan(cfg, {
    total: total + extrasTotal,
    paidAmount: 0,
    bookedAt: today,
    editionStart: edition?.date_start ?? null,
  });

  return NextResponse.json({
    price: total + extrasTotal,
    extrasTotal,
    deposit: cfg.deposit ?? PAYMENT_DEFAULTS.deposit,
    downpaymentPercent: cfg.downpayment_percent ?? PAYMENT_DEFAULTS.downpaymentPercent,
    refundDays: cfg.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays,
    milestones: plan.map((m) => ({ kind: m.kind, label: m.label, amount: m.amount, dueLabel: m.dueLabel, dueDate: m.dueDate })),
  });
}
