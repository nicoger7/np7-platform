import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { generateVoucherCode } from "@/lib/vouchers";

/**
 * Buy a gift voucher for a specific experience. Member-gated (you sign in to buy
 * so it lands in your account). Creates a PENDING voucher — paid by bank
 * transfer, activated by the team once the money lands. Amount is the chosen
 * package's price, locked at purchase.
 */
export async function POST(req: Request) {
  const user = await getPortalUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in to buy a gift voucher." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const experienceId = typeof body.experienceId === "string" ? body.experienceId : "";
  const packageId = typeof body.packageId === "string" && body.packageId ? body.packageId : null;
  const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim().slice(0, 120) : "";
  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim().slice(0, 160) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
  if (!experienceId) return NextResponse.json({ error: "Please choose an experience." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [{ data: exp }, pkgRes] = await Promise.all([
    db.from("exp_experiences").select("id, title, currency, status").eq("id", experienceId).maybeSingle(),
    packageId ? db.from("exp_packages").select("id, price, experience_id, status").eq("id", packageId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!exp || exp.status !== "published") return NextResponse.json({ error: "That experience isn't available." }, { status: 404 });
  const pkg = pkgRes?.data ?? null;
  if (packageId && (!pkg || pkg.experience_id !== experienceId || pkg.status !== "active")) {
    return NextResponse.json({ error: "That package isn't available." }, { status: 409 });
  }

  // Generate a unique code (retry on the rare collision).
  let code = generateVoucherCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await db.from("gift_vouchers").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
    code = generateVoucherCode();
  }

  const { data: voucher, error } = await db
    .from("gift_vouchers")
    .insert({
      code,
      buyer_contact_id: user.contactId,
      recipient_name: recipientName || null,
      recipient_email: recipientEmail || null,
      message: message || null,
      experience_id: experienceId,
      package_id: packageId,
      amount: pkg?.price ?? null,
      currency: exp.currency || "EUR",
      status: "pending",
    })
    .select("id, code, amount, currency")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, voucher });
}
