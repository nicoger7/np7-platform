import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { resolveTax } from "@/lib/hardware/orders-server";

// GET /api/shop/quote?country=AT — VAT rate + treatment for checkout display.
// Prices are gross; this only tells the customer what's inside them.
export async function GET(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const country = request.nextUrl.searchParams.get("country") || "DE";
  const tax = await resolveTax(db, country);
  return NextResponse.json(tax);
}
