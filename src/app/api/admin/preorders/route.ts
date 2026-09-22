import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
import { sortWindows, type PreorderWindow } from "@/lib/hardware/preorders";

/**
 * GET /api/admin/preorders — the windows, plus what has actually been ordered
 * in each of them. The demand count is the point of the dealer window: when it
 * closes, that number is what we order from the factory.
 */
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data, error } = await db.from("hw_preorder_windows").select("*").order("season", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const windows = (notArchived(data) as PreorderWindow[]).sort(sortWindows);

  // Orders placed in a window, with their lines, so we can count boards per model.
  const { data: orders } = await db
    .from("hw_orders")
    .select("id,preorder_window_id,payment_status,grand_total,deposit_cents,archived_at,hw_order_lines(title,variant_title,quantity)")
    .eq("order_kind", "preorder");

  const demand: Record<string, {
    orders: number; units: number; value: number; deposits: number;
    models: { title: string; units: number }[];
  }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of notArchived(orders ?? []) as any[]) {
    const key = o.preorder_window_id ?? "unassigned";
    const bucket = (demand[key] ??= { orders: 0, units: 0, value: 0, deposits: 0, models: [] });
    bucket.orders += 1;
    bucket.value += o.grand_total ?? 0;
    bucket.deposits += o.deposit_cents ?? 0;
    for (const l of o.hw_order_lines ?? []) {
      bucket.units += l.quantity ?? 0;
      const title = [l.title, l.variant_title].filter(Boolean).join(" ") || "Unnamed";
      const row = bucket.models.find((m) => m.title === title);
      if (row) row.units += l.quantity ?? 0;
      else bucket.models.push({ title, units: l.quantity ?? 0 });
    }
  }
  for (const b of Object.values(demand)) b.models.sort((a, z) => z.units - a.units);

  return NextResponse.json({ windows, demand });
}

/** POST /api/admin/preorders — a new window. Starts as a draft, always. */
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();

  if (!body.season || !body.audience || !body.opens_on || !body.closes_on) {
    return NextResponse.json({ error: "season, audience, opens_on and closes_on are required" }, { status: 400 });
  }
  if (body.closes_on < body.opens_on) {
    return NextResponse.json({ error: "A window cannot close before it opens" }, { status: 400 });
  }

  const { data, error } = await db.from("hw_preorder_windows").insert({
    season: Number(body.season),
    audience: body.audience,
    label: body.label ?? null,
    opens_on: body.opens_on,
    closes_on: body.closes_on,
    discount_pct: Number(body.discount_pct ?? 0),
    deposit_kind: body.deposit_kind ?? "amount",
    deposit_value: Number(body.deposit_value ?? 0),
    balance_due: body.balance_due ?? "on_dispatch",
    ships_from: body.ships_from || null,
    note: body.note ?? null,
    status: "draft",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
