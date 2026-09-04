import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/inventory/movements — the ledger, newest first
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const variantId = searchParams.get("variant_id");
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  let q = db.from("hw_stock_movements")
    .select("*, hw_variants(id,name,sku,hw_products(name)), from_loc:hw_stock_locations!hw_stock_movements_from_location_id_fkey(code,name), to_loc:hw_stock_locations!hw_stock_movements_to_location_id_fkey(code,name)")
    .order("occurred_at", { ascending: false }).limit(limit);
  if (variantId) q = q.eq("variant_id", variantId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
