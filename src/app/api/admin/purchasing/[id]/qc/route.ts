import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/admin/purchasing/:id/qc — add an inspection
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.type) return NextResponse.json({ error: "type is required" }, { status: 400 });

  const { data, error } = await db.from("hw_qc_inspections").insert({
    po_id: id,
    type: body.type,
    inspector: body.inspector || null,
    agency: body.agency || null,
    date: body.date || null,
    aql_level: body.aql_level || null,
    sample_size: body.sample_size != null && body.sample_size !== "" ? Number(body.sample_size) : null,
    result: body.result || null,
    report_url: body.report_url || null,
    blocks_balance_payment: body.blocks_balance_payment !== false,
    notes: body.notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
