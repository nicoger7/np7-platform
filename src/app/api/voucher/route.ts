import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { generateVoucherCode } from "@/lib/vouchers";

/**
 * Buy a gift voucher — GUEST checkout (no sign-in). The voucher is a VALUE voucher
 * (chosen amount), optionally earmarked for a specific experience or "any NP7
 * Experience". It never holds a spot — the recipient redeems it when they book an
 * available trip. Paid by bank transfer; team activates once the money lands.
 * Amounts: €200 steps to €5,000, then €1,000 steps to €10,000 (>€5,000 valid 2y).
 * Optional extra: Nico personally calls the recipient (phone + preferred date).
 */
function validAmount(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  if (n >= 200 && n <= 5000) return n % 200 === 0;
  if (n > 5000 && n <= 10000) return n % 1000 === 0;
  return false;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const experienceId = typeof body.experienceId === "string" && body.experienceId ? body.experienceId : null;
  const packageId = typeof body.packageId === "string" && body.packageId ? body.packageId : null;
  let amount = Math.round(Number(body.amount));
  const buyerName = typeof body.buyerName === "string" ? body.buyerName.trim().slice(0, 120) : "";
  const buyerEmail = typeof body.buyerEmail === "string" ? body.buyerEmail.trim().slice(0, 160).toLowerCase() : "";
  const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim().slice(0, 120) : "";
  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim().slice(0, 160) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
  const nicoCall = body.nicoCall === true;
  const recipientPhone = typeof body.recipientPhone === "string" ? body.recipientPhone.trim().slice(0, 40) : "";
  const callDate = typeof body.callDate === "string" ? body.callDate.trim().slice(0, 40) : "";

  if (!buyerName) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (nicoCall && !recipientPhone) return NextResponse.json({ error: "Add the recipient's phone number so Nico can call them." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [expRes, pkgRes, csRes] = await Promise.all([
    experienceId ? db.from("exp_experiences").select("id, title, currency, status, price").eq("id", experienceId).maybeSingle() : Promise.resolve({ data: null }),
    packageId ? db.from("exp_packages").select("id, price, experience_id, status").eq("id", packageId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("company_settings").select("iban, bic, bank_name, legal_name, currency").eq("division", "experience").maybeSingle().catch(() => ({ data: null })),
  ]);
  const exp = expRes?.data ?? null;
  if (experienceId && (!exp || exp.status !== "published")) return NextResponse.json({ error: "That experience isn't available." }, { status: 404 });
  const pkg = pkgRes?.data ?? null;
  if (packageId && (!pkg || pkg.status === "archived")) return NextResponse.json({ error: "That package isn't available." }, { status: 404 });
  if (pkg && experienceId && pkg.experience_id !== experienceId) return NextResponse.json({ error: "That package doesn't belong to the chosen experience." }, { status: 400 });

  // Value is server-authoritative: a chosen package's price, else the experience
  // price, else a free amount ("any experience" value voucher).
  const pkgPrice = pkg?.price != null ? Math.round(Number(pkg.price)) : null;
  const expPrice = exp?.price != null ? Math.round(Number(exp.price)) : null;
  if (pkgPrice && pkgPrice > 0) {
    amount = pkgPrice;
  } else if (experienceId && expPrice && expPrice > 0) {
    amount = expPrice;
  } else if (!validAmount(amount)) {
    return NextResponse.json({ error: "Please choose a voucher amount between €200 and €10,000." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cs = (csRes as any)?.data ?? null;
  const currency = exp?.currency || cs?.currency || "EUR";

  // Buyer contact: their account if signed in, else reuse by email, else create one.
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
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

  const row = {
    code,
    buyer_contact_id: buyerContactId,
    recipient_name: recipientName || null,
    recipient_email: recipientEmail || null,
    message: message || null,
    experience_id: experienceId,
    package_id: packageId,
    amount,
    currency,
    status: "pending",
    nico_call: nicoCall,
    recipient_phone: recipientPhone || null,
    call_preferred_date: callDate || null,
  };
  let { data: voucher, error } = await db.from("gift_vouchers").insert(row).select("id, code, amount, currency").single();
  // Pre-migration-053 fallback: drop the call columns and retry.
  if (error && /(nico_call|recipient_phone|call_preferred_date)/.test(error.message || "")) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { nico_call: _n, recipient_phone: _p, call_preferred_date: _d, ...rest } = row;
    ({ data: voucher, error } = await db.from("gift_vouchers").insert(rest).select("id, code, amount, currency").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Bank details so the buyer can pay immediately (same as on invoices).
  const pay = cs?.iban ? { iban: cs.iban, bic: cs.bic, bank_name: cs.bank_name, legal_name: cs.legal_name } : null;

  return NextResponse.json({ ok: true, voucher, pay });
}
