import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Spotguide contributor trust grants (see migration 066). Two roles:
 *   • moderator  — global; their edits/spots go live immediately
 *   • specialist — per-destination; needs a destinationId
 * Earned local-specialist standing is computed in code — this manages the
 * explicit NP7 appointments only.
 */

// GET /api/admin/spotguide/trust?contact=<id> — grants (optionally for one member)
export async function GET(request: NextRequest) {
  const contact = (request.nextUrl.searchParams.get("contact") ?? "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let q = db.from("spotguide_trust").select("id, contact_id, role, destination_id, note, created_at").order("created_at", { ascending: false });
  if (contact) q = q.eq("contact_id", contact);
  const { data: grants, error } = await q;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ grants: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows: { contact_id: string; destination_id: string | null }[] = grants ?? [];
  const contactIds = [...new Set(rows.map((g) => g.contact_id))];
  const destIds = [...new Set(rows.map((g) => g.destination_id).filter(Boolean))] as string[];
  const [{ data: contacts }, { data: dests }] = await Promise.all([
    contactIds.length ? db.from("contacts").select("id, name, email").in("id", contactIds) : Promise.resolve({ data: [] }),
    destIds.length ? db.from("destinations").select("id, name").in("id", destIds) : Promise.resolve({ data: [] }),
  ]);
  const who = new Map((contacts ?? []).map((c: { id: string; name: string; email: string }) => [c.id, c]));
  const destName = new Map((dests ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));
  const out = rows.map((g: Record<string, unknown>) => ({
    ...g,
    contactName: (who.get(g.contact_id as string) as { name?: string } | undefined)?.name ?? "—",
    contactEmail: (who.get(g.contact_id as string) as { email?: string } | undefined)?.email ?? null,
    destinationName: g.destination_id ? destName.get(g.destination_id as string) ?? "—" : null,
  }));
  return NextResponse.json({ grants: out });
}

// POST — grant. Body { contactId, role: 'moderator'|'specialist', destinationId?, note? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const contactId = (body.contactId ?? "").trim();
  const role = body.role === "specialist" ? "specialist" : body.role === "moderator" ? "moderator" : null;
  const destinationId = role === "specialist" ? (body.destinationId ?? "").trim() : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;
  if (!contactId || !role) return NextResponse.json({ error: "contactId and a valid role are required." }, { status: 400 });
  if (role === "specialist" && !destinationId) return NextResponse.json({ error: "A specialist needs a destination." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let existing = db.from("spotguide_trust").select("id").eq("contact_id", contactId).eq("role", role);
  existing = role === "specialist" ? existing.eq("destination_id", destinationId) : existing.is("destination_id", null);
  const { data: dup } = await existing.maybeSingle();
  if (dup) return NextResponse.json({ ok: true, id: dup.id, already: true });

  const { data, error } = await db.from("spotguide_trust")
    .insert({ contact_id: contactId, role, destination_id: destinationId, note })
    .select("id").single();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Run migration 066 first." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

// DELETE ?id=<grant id> — revoke
export async function DELETE(request: NextRequest) {
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("spotguide_trust").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
