import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { buildEan13, prefixCapacity, validateEan } from "@/lib/hardware/gtin";

// POST /api/admin/variants/:id/ean — issue the next GTIN from NP7's GS1 prefix.
// Numbers are allocated sequentially and NEVER reused (GS1 forbids recycling),
// so the ledger is the source of truth for what the next free reference is.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const { data: variant } = await db.from("hw_variants").select("id,sku,ean").eq("id", id).single();
  if (!variant) return NextResponse.json({ error: "variant not found" }, { status: 404 });
  if (variant.ean) {
    return NextResponse.json({ error: "This variant already has an EAN — clear it first if it's wrong." }, { status: 409 });
  }

  const { data: settings } = await db.from("company_settings").select("gs1_prefix").eq("division", "hardware").maybeSingle();
  const prefix = (settings?.gs1_prefix || "").replace(/\D/g, "");
  if (!prefix) {
    return NextResponse.json({
      error: "No GS1 company prefix set yet. Register with GS1 Germany, then add the prefix under Company settings — EANs can't be invented, retailers verify the owner.",
    }, { status: 409 });
  }
  if (prefix.length >= 12) {
    return NextResponse.json({ error: "That prefix leaves no room for item references — check it." }, { status: 409 });
  }

  // Next reference = highest issued + 1 (never refill gaps: retired numbers stay dead).
  const { data: last } = await db.from("hw_gtin_allocations")
    .select("item_reference").eq("prefix", prefix)
    .order("item_reference", { ascending: false }).limit(1).maybeSingle();
  const next = (last ? Number(last.item_reference) : 0) + 1;
  if (next >= prefixCapacity(prefix)) {
    return NextResponse.json({ error: "This prefix is exhausted — GS1 can extend your licence." }, { status: 409 });
  }

  const free = 12 - prefix.length;
  const itemReference = String(next).padStart(free, "0");
  const gtin = buildEan13(prefix, next);

  const { error } = await db.from("hw_gtin_allocations").insert({
    gtin, item_reference: itemReference, prefix, variant_id: id, allocated_by: "admin",
  });
  // Unique violation = someone allocated concurrently; ask for a retry rather
  // than silently handing out a duplicate.
  if (error) {
    return NextResponse.json({ error: "That number was just taken — try again." }, { status: 409 });
  }

  await db.from("hw_variants").update({ ean: gtin, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ean: gtin, item_reference: itemReference, prefix }, { status: 201 });
}

// DELETE /api/admin/variants/:id/ean — detach a wrongly-assigned number.
// The allocation row survives (marked retired) so the GTIN is never re-issued.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: variant } = await db.from("hw_variants").select("ean").eq("id", id).single();
  if (variant?.ean) {
    await db.from("hw_gtin_allocations")
      .update({ retired_at: new Date().toISOString(), variant_id: null, notes: "detached from variant" })
      .eq("gtin", variant.ean);
  }
  await db.from("hw_variants").update({ ean: null }).eq("id", id);
  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/variants/:id/ean — record a factory-assigned code we didn't
// issue (validated, but not taken from our prefix).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const check = validateEan(String(body.ean ?? ""));
  if (!check.valid) return NextResponse.json({ error: check.reason }, { status: 400 });

  const { data: clash } = await db.from("hw_variants").select("id,sku").eq("ean", check.normalized).neq("id", id).maybeSingle();
  if (clash) return NextResponse.json({ error: `${clash.sku} already carries that EAN.` }, { status: 409 });

  await db.from("hw_variants").update({ ean: check.normalized, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ean: check.normalized });
}
