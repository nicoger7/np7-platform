import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/inventory — levels pivoted per variant × location, with the
// latest landed cost per variant → inventory value at landed cost.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [locations, levels, variants, receipts] = await Promise.all([
    db.from("hw_stock_locations").select("*").order("is_virtual").order("name"),
    db.from("hw_stock_levels").select("*"),
    db.from("hw_variants").select("id,name,sku,archived_at,hw_products(id,name,category)"),
    db.from("hw_receipts").select("variant_id,unit_landed_cost,received_at").order("received_at", { ascending: false }),
  ]);
  if (levels.error) return NextResponse.json({ error: levels.error.message }, { status: 500 });

  // Latest landed cost per variant (receipts come newest-first).
  const latestCost = new Map<string, number>();
  for (const r of receipts.data ?? []) {
    if (r.unit_landed_cost != null && !latestCost.has(r.variant_id)) {
      latestCost.set(r.variant_id, Number(r.unit_landed_cost));
    }
  }

  const byVariant = new Map<string, Record<string, { on_hand: number; reserved: number }>>();
  for (const lv of levels.data ?? []) {
    const m = byVariant.get(lv.variant_id) ?? {};
    m[lv.location_id] = { on_hand: lv.on_hand, reserved: lv.reserved };
    byVariant.set(lv.variant_id, m);
  }

  const rows = (variants.data ?? [])
    .filter((v: { archived_at: string | null }) => !v.archived_at)
    .map((v: { id: string; name: string; sku: string; hw_products: { id: string; name: string; category: string } | null }) => ({
      variant_id: v.id,
      sku: v.sku,
      name: v.name,
      product: v.hw_products,
      levels: byVariant.get(v.id) ?? {},
      unit_landed_cost: latestCost.get(v.id) ?? null,
    }));

  return NextResponse.json({ locations: locations.data ?? [], rows });
}
