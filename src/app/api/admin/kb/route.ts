import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/kb — the knowledge shelf: every ACTIVE skill from the
 * milestone catalog (whether or not an entry exists yet — the catalog IS the
 * list, entries materialise on first edit) plus all equipment entries.
 */
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: skills }, { data: entries }, { data: sections }] = await Promise.all([
    db.from("level_milestones").select("key,label,tier,rank,discipline,sort_order,bonus").eq("active", true).order("sort_order"),
    db.from("kb_entries").select("*"),
    db.from("kb_sections").select("entry_id,status"),
  ]);
  const byRef = new Map((entries ?? []).filter((e: { kind: string }) => e.kind === "skill").map((e: { ref_key: string }) => [e.ref_key, e]));
  const secByEntry = new Map<string, { total: number; complete: number }>();
  for (const s of (sections ?? []) as { entry_id: string; status: string }[]) {
    const agg = secByEntry.get(s.entry_id) ?? { total: 0, complete: 0 };
    agg.total++; if (s.status === "complete") agg.complete++;
    secByEntry.set(s.entry_id, agg);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skillRows = ((skills ?? []) as any[]).map((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = byRef.get(m.key) as any;
    return {
      kind: "skill", refKey: m.key, label: m.label, rank: m.rank ?? m.tier, discipline: m.discipline,
      sortOrder: m.sort_order, bonus: m.bonus === true,
      entryId: e?.id ?? null, status: e?.status ?? "missing", websiteVisible: e?.website_visible ?? false,
      sections: e ? secByEntry.get(e.id) ?? { total: 0, complete: 0 } : { total: 0, complete: 0 },
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const equipmentRows = ((entries ?? []) as any[]).filter((e) => e.kind === "equipment")
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    .map((e) => ({
      kind: "equipment", refKey: e.ref_key, label: e.title, rank: null, discipline: null,
      sortOrder: e.sort_order, bonus: false,
      entryId: e.id, status: e.status, websiteVisible: e.website_visible,
      sections: secByEntry.get(e.id) ?? { total: 0, complete: 0 },
    }));
  return NextResponse.json({ skills: skillRows, equipment: equipmentRows });
}

/**
 * POST /api/admin/kb — materialise/create an entry.
 * Body: { kind: "skill", refKey } → entry for that milestone (idempotent)
 *       { kind: "equipment", title } → a new equipment entry
 */
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let body: { kind?: string; refKey?: string; title?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  if (body.kind === "skill") {
    if (!body.refKey) return NextResponse.json({ error: "Missing skill key" }, { status: 400 });
    const { data: existing } = await db.from("kb_entries").select("id").eq("kind", "skill").eq("ref_key", body.refKey).maybeSingle();
    if (existing) return NextResponse.json({ id: existing.id });
    const { data: m } = await db.from("level_milestones").select("label,sort_order").eq("key", body.refKey).maybeSingle();
    if (!m) return NextResponse.json({ error: "Unknown skill key" }, { status: 404 });
    const { data: created, error } = await db.from("kb_entries")
      .insert({ kind: "skill", ref_key: body.refKey, title: m.label, sort_order: m.sort_order ?? 0 })
      .select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: created.id });
  }
  if (body.kind === "equipment") {
    const title = (body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: created, error } = await db.from("kb_entries")
      .insert({ kind: "equipment", ref_key: slug, title })
      .select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: created.id });
  }
  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
