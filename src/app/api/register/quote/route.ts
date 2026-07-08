import { NextRequest, NextResponse } from "next/server";
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
      ? db.from("exp_editions").select("id,deposit,date_start").eq("id", editionId).maybeSingle()
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
  const plan = computePaymentPlan(cfg, {
    total: pkg.price ?? 0,
    paidAmount: 0,
    bookedAt: today,
    editionStart: edition?.date_start ?? null,
  });

  return NextResponse.json({
    price: pkg.price ?? 0,
    deposit: cfg.deposit ?? PAYMENT_DEFAULTS.deposit,
    downpaymentPercent: cfg.downpayment_percent ?? PAYMENT_DEFAULTS.downpaymentPercent,
    refundDays: cfg.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays,
    milestones: plan.map((m) => ({ kind: m.kind, label: m.label, amount: m.amount, dueLabel: m.dueLabel, dueDate: m.dueDate })),
  });
}
