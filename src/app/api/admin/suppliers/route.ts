import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";

// GET /api/admin/suppliers — list with SKU counts + open-PO counts
export async function GET(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let q = db.from("hw_suppliers").select("*").order("name");
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const suppliers = notArchived(data) as { id: string }[];

  const ids = suppliers.map((s: { id: string }) => s.id);
  const counts = new Map<string, { skus: number; openPos: number }>();
  if (ids.length) {
    const [{ data: skus }, { data: pos }] = await Promise.all([
      db.from("hw_supplier_skus").select("supplier_id").in("supplier_id", ids),
      db.from("hw_purchase_orders").select("supplier_id,status").in("supplier_id", ids)
        .not("status", "in", "(closed,cancelled)"),
    ]);
    for (const s of skus ?? []) {
      const c = counts.get(s.supplier_id) ?? { skus: 0, openPos: 0 };
      c.skus++; counts.set(s.supplier_id, c);
    }
    for (const p of pos ?? []) {
      const c = counts.get(p.supplier_id) ?? { skus: 0, openPos: 0 };
      c.openPos++; counts.set(p.supplier_id, c);
    }
  }
  return NextResponse.json(suppliers.map((s: { id: string }) => ({ ...s, ...(counts.get(s.id) ?? { skus: 0, openPos: 0 }) })));
}

// POST /api/admin/suppliers — create
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await db.from("hw_suppliers").insert({
    name: String(body.name),
    country: body.country || null,
    currency: body.currency || "USD",
    default_incoterm: body.default_incoterm || null,
    default_payment_terms: body.default_payment_terms || null,
    contact_name: body.contact_name || null,
    contact_email: body.contact_email || null,
    contact_phone: body.contact_phone || null,
    website: body.website || null,
    notes: body.notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
