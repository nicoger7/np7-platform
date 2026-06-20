import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/admin/destinations/generate
 * Creates a destination record for each distinct experience location (if missing)
 * and links those experiences to it. Idempotent — re-run anytime as you add
 * experiences. Records are created "published" with minimal content (name, region,
 * hero); the team fills the rest in the destination editor. Admin-only (middleware).
 */
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function POST() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: exps } = await db.from("exp_experiences").select("id, location, hero_image, destination_id").eq("status", "published");

  const byLoc = new Map<string, { ids: string[]; hero: string | null }>();
  for (const e of (exps || []) as { id: string; location: string | null; hero_image: string | null }[]) {
    const loc = (e.location || "").trim();
    if (!loc) continue;
    if (!byLoc.has(loc)) byLoc.set(loc, { ids: [], hero: e.hero_image });
    const g = byLoc.get(loc)!;
    g.ids.push(e.id);
    if (!g.hero && e.hero_image) g.hero = e.hero_image;
  }

  let created = 0, linked = 0;
  for (const [loc, info] of byLoc) {
    const [namePart, ...tail] = loc.split(",").map((s) => s.trim());
    const name = namePart || loc;
    const slug = slugify(name);
    const region = tail.join(", ") || null;

    const { data: existing } = await db.from("destinations").select("id, hero_image").eq("slug", slug).maybeSingle();
    let destId: string | undefined = existing?.id;
    if (!destId) {
      const { data: ins, error } = await db
        .from("destinations")
        .insert({ name, slug, region, hero_image: info.hero, status: "published", tagline: `Windsurf, wing & foil in ${name}` })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      destId = ins?.id;
      if (destId) created++;
    } else if (!existing?.hero_image && info.hero) {
      await db.from("destinations").update({ hero_image: info.hero }).eq("id", destId);
    }
    if (destId && info.ids.length) {
      await db.from("exp_experiences").update({ destination_id: destId }).in("id", info.ids);
      linked += info.ids.length;
    }
  }

  return NextResponse.json({ ok: true, created, linked });
}
