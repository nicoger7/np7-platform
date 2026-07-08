import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { isActiveTeamMember } from "@/lib/admin-auth";

export const runtime = "nodejs";

function db() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
}

// GET /api/admin/memories/stars?editionId=&bookingId=  → keepers for one scope
export async function GET(request: NextRequest) {
  try { await requireAuth(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  const sp = request.nextUrl.searchParams;
  const editionId = sp.get("editionId");
  const bookingId = sp.get("bookingId"); // absent/empty = "Everyone" scope
  if (!editionId) return Response.json({ error: "editionId required" }, { status: 400 });

  let q = db().from("memory_stars").select("kind, ref").eq("edition_id", editionId);
  q = bookingId ? q.eq("booking_id", bookingId) : q.is("booking_id", null);
  const { data, error } = await q;
  if (error) {
    // Pre-migration-075 tolerance: no table yet → no keepers.
    if (/memory_stars/.test(error.message) || error.code === "42P01") return Response.json({ photos: [], videos: [] });
    return Response.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as { kind: string; ref: string }[];
  return Response.json({
    photos: rows.filter((r) => r.kind === "photo").map((r) => r.ref),
    videos: rows.filter((r) => r.kind === "video").map((r) => r.ref),
  });
}

// POST { editionId, bookingId?, kind, ref, starred }  → set/unset one keeper
export async function POST(request: NextRequest) {
  try { await requireAuth(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  const { editionId, bookingId, kind, ref, starred } = await request.json().catch(() => ({}));
  if (!editionId || !kind || !ref || (kind !== "photo" && kind !== "video")) {
    return Response.json({ error: "editionId, kind (photo|video) and ref are required" }, { status: 400 });
  }
  const admin = db();
  if (starred === false) {
    const { error } = await admin.from("memory_stars").delete().eq("kind", kind).eq("ref", ref);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, starred: false });
  }
  // upsert on (kind, ref) so re-starring is idempotent
  const { error } = await admin.from("memory_stars")
    .upsert({ edition_id: editionId, booking_id: bookingId || null, kind, ref }, { onConflict: "kind,ref" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, starred: true });
}
