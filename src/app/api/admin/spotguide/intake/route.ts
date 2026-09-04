import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { CONDITIONS, INFRASTRUCTURE_TAGS, LEVELS } from "@/lib/spotguide";
import { requireAdminGate } from "@/lib/admin-auth";
/**
 * AI spot intake — paste ANY free text about a spot (a rider's WhatsApp
 * message, forum paragraph, jibe's research) and get a structured DRAFT spot
 * in the moderation queue: fields extracted, matched to an existing
 * destination or a new draft area created. Nothing goes public — drafts wait
 * for review in the existing spot editor.
 */

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

type Extracted = {
  destination_id: string | null;
  new_destination: { name: string; region: string | null; country: string | null } | null;
  spot: {
    name: string; summary: string | null; description: string | null;
    levels: string[]; conditions: string[]; infrastructure: string[];
    lat: number | null; lng: number | null;
  };
  notes: string[];
};

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 20) return NextResponse.json({ error: "Paste a bit more text — at least a sentence or two about the spot." }, { status: 400 });

  // No platform API key? jibe brings its own brain: queue the text and jibe
  // structures it into a draft spot on its next (~4-hourly) spotguide run.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qdb = createAdminClient() as any;
    const { error } = await qdb.from("spot_intake_queue").insert({ text });
    if (error) return NextResponse.json({ error: `Couldn't queue: ${error.message}` }, { status: 400 });
    return NextResponse.json({ ok: true, queued: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: dests } = await db.from("destinations").select("id, name, region, country, lat, lng").order("name");
  type DestRow = { id: string; name: string; region: string | null; country: string | null; lat: number | null; lng: number | null };
  const destRows = (dests ?? []) as DestRow[];
  // An area's centre: its own coordinates, else the average of its spots — the
  // model can't judge "is this the same area?" from names alone (Strand Horst
  // IS the Veluwemeer), so it gets geography too.
  const { data: destSpots } = await db.from("spots").select("destination_id, lat, lng").not("lat", "is", null);
  const centres = new Map<string, { lat: number; lng: number }>();
  for (const d of destRows) if (d.lat != null && d.lng != null) centres.set(d.id, { lat: d.lat, lng: d.lng });
  const acc = new Map<string, { lat: number; lng: number; n: number }>();
  for (const s of (destSpots ?? []) as { destination_id: string; lat: number; lng: number }[]) {
    const a = acc.get(s.destination_id) ?? { lat: 0, lng: 0, n: 0 };
    acc.set(s.destination_id, { lat: a.lat + s.lat, lng: a.lng + s.lng, n: a.n + 1 });
  }
  for (const [id, a] of acc) if (!centres.has(id) && a.n > 0) centres.set(id, { lat: a.lat / a.n, lng: a.lng / a.n });
  const destList = destRows
    .map((d) => {
      const c = centres.get(d.id);
      return `${d.id} — ${d.name}${d.region ? `, ${d.region}` : ""}${d.country ? ` (${d.country})` : ""}${c ? ` [~${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}]` : ""}`;
    }).join("\n");

  /** km between two coordinates (haversine) */
  const kmBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
    const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const NEARBY_KM = 30; // same riding area, not a new destination

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: `You structure windsurf spot descriptions for the NP7 spotguide. Reply with ONLY a JSON object, no prose, matching:
{
  "destination_id": "<uuid from the list below if the spot clearly belongs to one, else null>",
  "new_destination": null | { "name": "...", "region": "...", "country": "..." },
  "spot": {
    "name": "...",
    "summary": "one enticing sentence",
    "description": "2-4 factual sentences from the text (launch, hazards, crowd, season). Never invent facts.",
    "levels": subset of ${JSON.stringify(LEVELS)},
    "conditions": subset of ${JSON.stringify(CONDITIONS.map((c) => c.key))},
    "infrastructure": subset of ${JSON.stringify(INFRASTRUCTURE_TAGS)},
    "lat": number | null, "lng": number | null
  },
  "notes": ["anything uncertain or worth a human check"]
}
Rules: extract only what the text supports (well-known spot coordinates from general knowledge are OK — note it). destination = the AREA (e.g. "Tarifa"), spot = the specific launch. Each existing destination below carries its approximate centre in [lat, lng] — if the spot lies within roughly 30 km of one, it belongs to THAT area: match it, do not propose a new one (a named beach on a lake is a SPOT of that lake, not its own area). Only propose new_destination when the spot is genuinely far from every existing area, or no coordinates can be determined.

Existing destinations:
${destList}`,
    messages: [{ role: "user", content: text }],
  });

  const raw = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  let parsed: Extracted;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return NextResponse.json({ error: "The AI reply wasn't valid JSON — try again or simplify the text.", raw }, { status: 502 });
  }
  if (!parsed?.spot?.name) return NextResponse.json({ error: "Couldn't identify a spot in that text.", notes: parsed?.notes ?? [] }, { status: 422 });

  // sanitise against the real vocabularies — the model gets no write freedom
  const levels = (parsed.spot.levels ?? []).filter((l) => (LEVELS as readonly string[]).includes(l));
  const conditions = (parsed.spot.conditions ?? []).filter((c) => CONDITIONS.some((k) => k.key === c));
  const infrastructure = (parsed.spot.infrastructure ?? []).filter((t) => (INFRASTRUCTURE_TAGS as readonly string[]).includes(t));

  // destination: matched, or a new DRAFT area (invisible until published)
  let destinationId = parsed.destination_id && destRows.some((d) => d.id === parsed.destination_id) ? parsed.destination_id : null;
  let createdDestination = null;
  const autoNotes: string[] = [];
  // Geography beats the model: if the pin sits inside an existing area, use it —
  // this is what stopped a lake's own beach from becoming a second destination.
  const pLat = parsed.spot.lat, pLng = parsed.spot.lng;
  if (typeof pLat === "number" && typeof pLng === "number") {
    let best: { id: string; name: string; km: number } | null = null;
    for (const d of destRows) {
      const c = centres.get(d.id);
      if (!c) continue;
      const km = kmBetween(pLat, pLng, c.lat, c.lng);
      if (!best || km < best.km) best = { id: d.id, name: d.name, km };
    }
    if (best && best.km <= NEARBY_KM && best.id !== destinationId) {
      autoNotes.push(destinationId
        ? `Re-matched to ${best.name} — the pin is ${best.km.toFixed(0)} km from its centre.`
        : `Matched to the existing area ${best.name} (${best.km.toFixed(0)} km away) instead of proposing a new one.`);
      destinationId = best.id;
    }
  }
  if (!destinationId) {
    const nd = parsed.new_destination;
    if (!nd?.name) return NextResponse.json({ error: "No destination match and no new area proposed.", notes: parsed.notes ?? [] }, { status: 422 });
    const { data: destRow, error: dErr } = await db.from("destinations").insert({
      name: nd.name, region: nd.region ?? null, country: nd.country ?? null,
      slug: slugify(nd.name), spotguide_status: "draft",
    }).select("id, name, slug").single();
    if (dErr) return NextResponse.json({ error: `Couldn't create the area: ${dErr.message}` }, { status: 400 });
    destinationId = destRow.id as string;
    createdDestination = destRow;
  }

  const { data: spotRow, error: sErr } = await db.from("spots").insert({
    destination_id: destinationId,
    name: parsed.spot.name,
    slug: slugify(parsed.spot.name),
    summary: parsed.spot.summary ?? null,
    description: parsed.spot.description ?? null,
    level: levels[0] ?? null,
    levels,
    conditions,
    infrastructure,
    lat: parsed.spot.lat ?? null,
    lng: parsed.spot.lng ?? null,
    status: "draft",          // never public without a human OK
    source: "jibe",
    verification: "pending",
  }).select("id, name, slug, destination_id").single();
  if (sErr) return NextResponse.json({ error: `Couldn't create the spot: ${sErr.message}` }, { status: 400 });

  return NextResponse.json({
    ok: true,
    spot: spotRow,
    destination: createdDestination,
    extracted: { levels, conditions, infrastructure, lat: parsed.spot.lat, lng: parsed.spot.lng },
    notes: [...autoNotes, ...(parsed.notes ?? [])],
  });
}
