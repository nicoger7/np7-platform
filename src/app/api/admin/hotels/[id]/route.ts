import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";

const ALLOWED = ["name", "prefix", "location", "image_url", "images", "description", "website", "maps_url"];
// Columns added in migration 023 — strip & retry if not applied yet.
const PENDING_OPTIONAL = ["image_url", "images", "description", "website"];

// PUT /api/admin/hotels/:id — update a hotel (incl. media)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const sanitized = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED.includes(k)));

  const doUpdate = (payload: Record<string, unknown>) =>
    client.from("hotels").update(payload).eq("id", id).select().single();

  let { data, error } = await doUpdate(sanitized);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    const stripped = Object.fromEntries(Object.entries(sanitized).filter(([k]) => !PENDING_OPTIONAL.includes(k)));
    ({ data, error } = await doUpdate(stripped));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/hotels/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const { ok, error } = await softDelete(client, "hotels", id);
  if (!ok) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}
