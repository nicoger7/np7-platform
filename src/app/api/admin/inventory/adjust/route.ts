import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getLocationsByCode, recordMovement } from "@/lib/hardware/ops-server";

// POST /api/admin/inventory/adjust — manual correction with a reason.
// Positive delta books stock in from LOSS; negative books it out to LOSS —
// the ledger stays double-entry either way, and shrinkage is visible.
// Body: { variant_id, location_id, delta, reason?, note }
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  const delta = Number(body.delta);
  if (!body.variant_id || !body.location_id || !delta) {
    return NextResponse.json({ error: "variant_id, location_id and a non-zero delta are required" }, { status: 400 });
  }
  if (!body.note) {
    return NextResponse.json({ error: "A note is required — every adjustment needs a why." }, { status: 400 });
  }

  const locations = await getLocationsByCode(db);
  const loss = locations["LOSS"];
  if (!loss) return NextResponse.json({ error: "LOSS location missing" }, { status: 500 });

  const id = await recordMovement(db, {
    variant_id: body.variant_id,
    from: delta > 0 ? loss.id : body.location_id,
    to: delta > 0 ? body.location_id : loss.id,
    qty: Math.abs(delta),
    reason: body.reason || "adjustment",
    note: body.note,
    actor: "admin",
  });
  return NextResponse.json({ ok: true, movement_id: id }, { status: 201 });
}
