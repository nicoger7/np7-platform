import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// DELETE /api/admin/inbound/:id/lines/:lineId — only while booked
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, lineId } = await params;
  const { data: shipment } = await db.from("hw_inbound_shipments").select("status").eq("id", id).single();
  if (shipment && shipment.status !== "booked") {
    return NextResponse.json({ error: "Lines can only change while the shipment is booked." }, { status: 409 });
  }
  const { error } = await db.from("hw_inbound_lines").delete().eq("id", lineId).eq("shipment_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
