import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { prefixCapacity } from "@/lib/hardware/gtin";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/gtin — allocation status: is a GS1 prefix configured, how
// many numbers it can ever issue, how many are gone.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: settings }, { count }] = await Promise.all([
    db.from("company_settings").select("gs1_prefix").eq("division", "hardware").maybeSingle(),
    db.from("hw_gtin_allocations").select("id", { count: "exact", head: true }),
  ]);
  const prefix = (settings?.gs1_prefix || "").replace(/\D/g, "");
  return NextResponse.json({
    prefix: prefix || null,
    capacity: prefix ? prefixCapacity(prefix) : 0,
    used: count ?? 0,
    remaining: prefix ? Math.max(0, prefixCapacity(prefix) - (count ?? 0)) : 0,
  });
}
