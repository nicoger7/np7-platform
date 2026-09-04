import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { revalidateSpotguide } from "@/lib/revalidate-public";
import { slugifySpot } from "@/lib/spotguide";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/spots?destination_id=… — list a destination's spots (all statuses)
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const destinationId = request.nextUrl.searchParams.get("destination_id");
  let q = db.from("spots").select("*").order("sort_order").order("name");
  if (destinationId) q = q.eq("destination_id", destinationId);
  const { data, error } = await q;
  if (error) {
    if (/spots|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: "Run migration 062 first." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

// POST /api/admin/spots — create a draft spot under a destination
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.destination_id) return NextResponse.json({ error: "destination_id required" }, { status: 400 });
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const slug = body.slug ? slugifySpot(body.slug) : slugifySpot(body.name);
  const { data, error } = await db
    .from("spots")
    .insert({
      destination_id: body.destination_id,
      name: body.name,
      slug,
      status: body.status || "draft",
      source: "np7",
      verification: "np7",
    })
    .select("*")
    .single();
  if (error) {
    if (/spots|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: "Run migration 062 first." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // a new spot changes its destination page and the index's spot counts
  const { data: dest } = await db.from("destinations").select("slug").eq("id", body.destination_id).maybeSingle();
  revalidateSpotguide(dest?.slug ?? null, { alsoMagazine: true });
  return NextResponse.json(data, { status: 201 });
}
