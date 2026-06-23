import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { generateVoucherCode } from "@/lib/vouchers";

/**
 * Buy a gift voucher for a specific experience — GUEST checkout (no sign-in).
 * The buyer gives name + email; we reuse/create a contact for them (or use their
 * account if signed in). Creates a PENDING voucher — paid by bank transfer,
 * activated by the team once the money lands. Amount = chosen package price.
 * Returns the bank details so the buyer can pay right away.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const experienceId = typeof body.experienceId === "string" ? body.experienceId : "";
  const packageId = typeof body.packageId === "string" && body.packageId ? body.packageId : null;
  const buyerName = typeof body.buyerName === "string" ? body.buyerName.trim().slice(0, 120) : "";
  const buyerEmail = typeof body.buyerEmail === "string" ? body.buyerEmail.trim().slice(0, 160).toLowerCase() : "";
  const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim().slice(0, 120) : "";
  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim().slice(0, 160) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";

  if (!experienceId) return NextResponse.json({ error: "Please choose an experience." }, { status: 400 });
  if (!buyerName) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [{ data: exp }, pkgRes, csRes] = await Promise.all([
    db.from("exp_experiences").select("id, title, currency, status").eq("id", experienceId).maybeSingle(),
    packageId ? db.from("exp_packages").select("id, price, experience_id, status").eq("id", packageId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("company_settings").select("iban, bic, bank_name, legal_name").eq("division", "experience").maybeSingle().catch(() => ({ data: null })),
  ]);
  if (!exp || exp.status !== "published") return NextResponse.json({ error: "That experience isn't available." }, { status: 404 });
  const pkg = pkgRes?.data ?? null;
  if (packageId && (!pkg || pkg.experience_id !== experienceId || pkg.status !== "active")) {
    return NextResponse.json({ error: "That package isn't available." }, { status: 409 });
  }

  // Buyer contact: their account if signed in, else reuse by email, else create one.
  const user = await getPortalUser().catch(() => null);
  let buyerContactId: string | undefined = user?.contactId;
  if (!buyerContactId) {
    const { data: existing } = await db.from("contacts").select("id").eq("email", buyerEmail).maybeSingle();
    buyerContactId = existing?.id;
    if (!buyerContactId) {
      const { data: created, error: cErr } = await db.from("contacts").insert({ name: buyerName, email: buyerEmail, source: "voucher-buyer" }).select("id").single();
      if (cErr) return NextResponse.json({ error: "Could not save your details. Please try again." }, { status: 500 });
      buyerContactId = created.id;
    }
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
      buyer_contact_id: buyerContactId,
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

  // Bank details so the buyer can pay immediately (same as on invoices).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (csRes as any)?.data ?? null;
  const pay = c?.iban ? { iban: c.iban, bic: c.bic, bank_name: c.bank_name, legal_name: c.legal_name } : null;

  return NextResponse.json({ ok: true, voucher, pay });
}
