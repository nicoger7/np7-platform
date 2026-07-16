import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { CONDITIONS, INFRASTRUCTURE_TAGS, LEVELS } from "@/lib/spotguide";

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
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Add ANTHROPIC_API_KEY to the environment to enable AI intake." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 20) return NextResponse.json({ error: "Paste a bit more text — at least a sentence or two about the spot." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: dests } = await db.from("destinations").select("id, name, region, country").order("name");
  const destList = ((dests ?? []) as { id: string; name: string; region: string | null; country: string | null }[])
    .map((d) => `${d.id} — ${d.name}${d.region ? `, ${d.region}` : ""}${d.country ? ` (${d.country})` : ""}`).join("\n");

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
Rules: extract only what the text supports (well-known spot coordinates from general knowledge are OK — note it). destination = the AREA (e.g. "Tarifa"), spot = the specific launch. If neither an existing destination fits nor the area is clear, propose new_destination.

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
  let destinationId = parsed.destination_id && (dests ?? []).some((d: { id: string }) => d.id === parsed.destination_id) ? parsed.destination_id : null;
  let createdDestination = null;
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
    notes: parsed.notes ?? [],
  });
}
