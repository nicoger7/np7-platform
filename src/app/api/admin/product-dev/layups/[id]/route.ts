import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdPatch, pdDelete } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
const CFG = PD_ENTITIES.layups;

// GET — one build sheet with its plies, in ply_index order.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const db = pdDb();
  const { id } = await params;

  const [{ data: layup, error }, { data: plies }] = await Promise.all([
    db.from("pd_layups").select(CFG.select).eq("id", id).single(),
    db.from("pd_layup_plies").select("*").eq("layup_id", id).order("ply_index"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ ...layup, plies: plies ?? [] });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  return pdPatch(CFG, request, id);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  return pdDelete(CFG, id);
}
