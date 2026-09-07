import { NextRequest, NextResponse, after } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { revalidateDestinationById } from "@/lib/revalidate-public";
import { slugifySpot, asWindWindow, CONDITIONS, LEVELS } from "@/lib/spotguide";
import { fetchWindStatsBoth } from "@/lib/wind-stats";
import { getStanding } from "@/lib/spotguide-trust";
import { canAutoPublish } from "@/lib/spotguide-autopublish";
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
    .select("id, name, level, conditions, description, lat, lng, submitted_by, created_at")
    .eq("destination_id", dest).eq("source", "member").eq("verification", "pending").eq("status", "published")
    .order("created_at", { ascending: false });
  const ids = (spots ?? []).map((s: { id: string }) => s.id);
  const [{ data: verifs }, fieldRes] = await Promise.all([
    ids.length ? db.from("spot_verifications").select("spot_id, contact_id, kind").in("spot_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("spot_field_verifications").select("spot_id, contact_id, field, kind").in("spot_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const fieldVerify = !(fieldRes && fieldRes.error); // false until migration 066 adds the table
  const fieldVerifs = fieldRes?.data ?? []; // empty (and harmless) before migration 066

  // Build a { confirms, flags, mine } tally for one category from a set of rows.
  const tally = (rows: { contact_id: string; kind: string }[]) => ({
    confirms: new Set(rows.filter((r) => r.kind === "confirm").map((r) => r.contact_id)).size,
    flags: new Set(rows.filter((r) => r.kind === "flag").map((r) => r.contact_id)).size,
    mine: (rows.find((r) => r.contact_id === user.contactId)?.kind ?? null) as "confirm" | "flag" | null,
  });

  const out = (spots ?? []).map((s: Record<string, unknown>) => {
    const loc = (verifs ?? []).filter((v: { spot_id: string }) => v.spot_id === s.id);
    const fv = (field: string) => (fieldVerifs as { spot_id: string; field: string; contact_id: string; kind: string }[]).filter((v) => v.spot_id === s.id && v.field === field);
    return {
      id: s.id, name: s.name, level: s.level, conditions: s.conditions ?? [], description: s.description,
      lat: s.lat ?? null, lng: s.lng ?? null,
      isOwn: s.submitted_by === user.contactId,
      cats: { location: tally(loc), level: tally(fv("level")), conditions: tally(fv("conditions")) },
    };
  });
  return NextResponse.json({ loggedIn: true, spots: out, fieldVerify });
}

// POST /api/portal/spotguide/spots — a member adds a spot (our structured fields)
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to add a spot." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  if (name.length < 2) return NextResponse.json({ error: "Give the spot a name." }, { status: 400 });
  const coords = typeof body.coords === "string" ? parseCoords(body.coords) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  /*
   * A SPOT IS A PLACE, SO IT NEEDS A PLACE.
   *
   * The pin was only ever required by the form (add-spot.tsx: `if (!pin)`).
   * The insert below reads `coords?.lat ?? null`, so a POST straight at this
   * route created a spot with no coordinates at all: absent from the map,
   * skipped by every distance check, and impossible to verify, since confirming
   * a spot means recognising where it is.
   */
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return NextResponse.json({ error: "Drop a pin on the map so we know exactly where it is." }, { status: 400 });
  }

  // Either attach to an existing destination, or the member is proposing a NEW
  // area → create a pending destination (draft + submitted_by) for NP7 to review.
  let destinationId = (body.destination_id ?? "").trim();
  const newArea = typeof body.new_destination === "string" ? body.new_destination.trim().slice(0, 80) : "";
  if (!destinationId && newArea.length >= 2) {
    const slug = slugifySpot(newArea) + "-" + Math.random().toString(36).slice(2, 6);
    const { data: nd, error: dErr } = await db.from("destinations").insert({
      name: newArea, slug,
      country: (typeof body.new_country === "string" && body.new_country.trim()) ? body.new_country.trim().slice(0, 80) : null,
      region: (typeof body.new_region === "string" && body.new_region.trim()) ? body.new_region.trim().slice(0, 120) : null,
      lat: coords?.lat ?? null, lng: coords?.lng ?? null,
      status: "draft", spotguide_status: "draft", submitted_by: user.contactId,
    }).select("id").single();
    if (dErr) {
      if (/does not exist|schema cache/i.test(dErr.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
      return NextResponse.json({ error: "Could not create the area." }, { status: 500 });
    }
    destinationId = nd.id;
  }
  if (!destinationId) return NextResponse.json({ error: "Pick a destination or name a new area." }, { status: 400 });
  const { data: dest } = await db.from("destinations").select("id").eq("id", destinationId).maybeSingle();
  if (!dest) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  const levels = Array.isArray(body.levels) ? body.levels.filter((l: string) => (LEVELS as readonly string[]).includes(l)) : [];
  const level = levels[0] ?? (LEVELS.includes(body.level) ? body.level : null); // single `level` = primary, kept for back-compat
  const conditions = Array.isArray(body.conditions) ? body.conditions.filter((c: string) => CONDITIONS.some((x) => x.key === c)) : [];
  const infrastructure = Array.isArray(body.infrastructure) ? body.infrastructure.map((t: unknown) => String(t).slice(0, 40)).slice(0, 20) : [];
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : null;
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 240) : null;

  // A trusted local specialist / moderator's spot goes live immediately;
  // everyone else's lands pending for cross-member verification.
  const standing = await getStanding(db, user.contactId, destinationId);
  let verification = standing.moderator || standing.specialist ? "community" : "pending";

  /*
   * A member who has actually been there, pinning beside a spot NP7 verified
   * itself, does not have to wait for three riders. Everything the decision
   * looks at is ours and local, so there is no lookup to be slow or down, and
   * every failure inside it holds the spot rather than releasing it.
   */
  const auto = verification === "pending"
    ? await canAutoPublish(db, user.contactId, destinationId, coords, name, !!newArea)
    : null;
  if (auto?.publish) verification = "community";

  /*
   * The slug is a URL now (/spotguide/<area>/<spot>), not just a column. Two
   * spots sharing one inside the same area make that link ambiguous, and the
   * page resolves it by taking the first match, so one of the two becomes
   * unreachable. Suffix the loser rather than refuse the member's name.
   */
  let slug = slugifySpot(name) || "spot";
  {
    const { data: clash } = await db.from("spots").select("slug").eq("destination_id", destinationId).like("slug", `${slug}%`);
    const taken = new Set(((clash ?? []) as { slug: string | null }[]).map((r) => r.slug));
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
  }

  const insertRow: Record<string, unknown> = {
    destination_id: destinationId, name, slug,
    level, levels, conditions, infrastructure, wind_window: asWindWindow(body.wind_window),
    lat: coords.lat, lng: coords.lng,
    /*
     * THE PIN PUBLISHES. THE PROSE DOES NOT.
     *
     * Nothing above reads the description, and the description is where the
     * claims that could hurt somebody live: where to launch, what the bottom is,
     * whether you can stand. So an auto-published spot goes live as a location
     * and its words go onto the normal edit ladder for a human to confirm.
     */
    description: auto?.publish ? null : description,
    summary: auto?.publish ? null : summary,
    source: "member", submitted_by: user.contactId,
    status: "published", verification,
    auto_review: auto?.publish ? { at: new Date().toISOString(), ...auto.checks, evidence: auto.evidence } : null,
  };
  let { data, error } = await db.from("spots").insert(insertRow).select("id").single();
  // tolerate the levels column not existing yet (migration 082): fall back to the single `level`
  if (error && /\blevels\b/i.test(error.message)) {
    delete insertRow.levels;
    ({ data, error } = await db.from("spots").insert(insertRow).select("id").single());
  }
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save the spot." }, { status: 500 });
  }

  // Fill in the wind climatology immediately (in the background) so a new spot
  // shows its wind stats right away instead of waiting for the weekly cron.
  if (coords) {
    const spotId = data.id as string;
    const { lat, lng } = coords;
    after(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bg = createAdminClient() as any;
        const stats = await fetchWindStatsBoth(lat, lng);
        await bg.from("spots").update({ wind_stats: stats, wind_stats_at: new Date().toISOString() }).eq("id", spotId);
      } catch { /* the wind-stats cron will retry */ }
    });
  }
  /*
   * The audit trail, and the words waiting for a human.
   *
   * The table is append-only and outlives the spot, which the column on the row
   * does not. It is also what the "one reversal and never again" rule counts, so
   * it has to exist before that member can auto-publish a second time.
   *
   * Note what is NOT here: publishDestinationIfEarned. A whole destination page
   * going public is a bigger decision than one pin, and it must never fall out
   * of a machine's verdict.
   */
  if (auto?.publish) {
    await db.from("spot_auto_publish").insert({
      spot_id: data.id, contact_id: user.contactId,
      payload: { checks: auto.checks, evidence: auto.evidence, name, coords },
    }).then(() => {}, () => {});
    if (description || summary) {
      await db.from("spot_edits").insert({
        spot_id: data.id, contact_id: user.contactId, field: "info",
        new_value: [summary, description].filter(Boolean).join("\n\n"), status: "pending",
      }).then(() => {}, () => {});
    }
  }

  // the new spot (badged "under review") must show on the cached index at once
  await revalidateDestinationById(db, destinationId, { alsoMagazine: true });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
