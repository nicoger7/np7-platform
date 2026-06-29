import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { slugifySpot, asWindWindow, CONDITIONS, LEVELS } from "@/lib/spotguide";
import { parseCoords } from "@/lib/blog-templates";

/**
 * Member-contributed spots. Members submit within OUR structure; the spot lands
 * published-but-pending (verification='pending') so it stays out of the public
 * guide until 3 members confirm it (→ community) or NP7 verifies it.
 */

// GET /api/portal/spotguide/spots?dest=<id> — pending member spots awaiting
// verification, so logged-in members can help confirm them.
export async function GET(request: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ loggedIn: false, spots: [] });
  const dest = (request.nextUrl.searchParams.get("dest") ?? "").trim();
  if (!dest) return NextResponse.json({ loggedIn: true, spots: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: spots } = await db
    .from("spots")
    .select("id, name, level, conditions, description, submitted_by, created_at")
    .eq("destination_id", dest).eq("source", "member").eq("verification", "pending")
    .order("created_at", { ascending: false });
  const ids = (spots ?? []).map((s: { id: string }) => s.id);
  const { data: verifs } = ids.length
    ? await db.from("spot_verifications").select("spot_id, contact_id, kind").in("spot_id", ids)
    : { data: [] };

  const out = (spots ?? []).map((s: Record<string, unknown>) => {
    const vs = (verifs ?? []).filter((v: { spot_id: string }) => v.spot_id === s.id);
    return {
      id: s.id, name: s.name, level: s.level, conditions: s.conditions ?? [], description: s.description,
      isOwn: s.submitted_by === user.contactId,
      confirms: vs.filter((v: { kind: string }) => v.kind === "confirm").length,
      iConfirmed: vs.some((v: { contact_id: string; kind: string }) => v.contact_id === user.contactId && v.kind === "confirm"),
    };
  });
  return NextResponse.json({ loggedIn: true, spots: out });
}

// POST /api/portal/spotguide/spots — a member adds a spot (our structured fields)
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to add a spot." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const destinationId = (body.destination_id ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!destinationId) return NextResponse.json({ error: "Missing destination." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "Give the spot a name." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: dest } = await db.from("destinations").select("id").eq("id", destinationId).maybeSingle();
  if (!dest) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  const level = LEVELS.includes(body.level) ? body.level : null;
  const conditions = Array.isArray(body.conditions) ? body.conditions.filter((c: string) => CONDITIONS.some((x) => x.key === c)) : [];
  const infrastructure = Array.isArray(body.infrastructure) ? body.infrastructure.map((t: unknown) => String(t).slice(0, 40)).slice(0, 20) : [];
  const coords = typeof body.coords === "string" ? parseCoords(body.coords) : null;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : null;
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 240) : null;

  const { data, error } = await db.from("spots").insert({
    destination_id: destinationId, name, slug: slugifySpot(name),
    level, conditions, infrastructure, wind_window: asWindWindow(body.wind_window),
    lat: coords?.lat ?? null, lng: coords?.lng ?? null, description, summary,
    source: "member", submitted_by: user.contactId,
    status: "published", verification: "pending",
  }).select("id").single();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save the spot." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
