import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/shop/withdraw-lookup — { email, order_number } → { token }
// Entry for the always-reachable withdrawal function when the customer doesn't
// have their order link at hand. Both fields must match; the answer is the same
// generic error either way (no account enumeration).
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const number = Number(String(body?.order_number ?? "").replace(/[^0-9]/g, ""));
  if (!email || !number) return NextResponse.json({ error: "Enter your email and order number." }, { status: 400 });

  const { data } = await db.from("hw_orders")
    .select("public_token").eq("display_number", number).ilike("email", email).maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "No order found for that combination — check the order number in your confirmation email." }, { status: 404 });
  }
  return NextResponse.json({ token: data.public_token });
}
