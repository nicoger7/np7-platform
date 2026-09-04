import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/variants — all variants with product names, for pickers
// (supplier catalog, PO lines, inventory adjustments).
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("hw_variants")
    .select("id,product_id,sku,name,serialized,lifecycle,archived_at,weight_g,box_l_mm,box_w_mm,box_h_mm,hw_products(id,name,category)")
    .order("sku");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(notArchived(data));
}
