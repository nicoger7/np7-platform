import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { listUnderPrefix, r2VideoEnabled } from "@/lib/r2-presign";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Crawl what exists and write it into media_assets.
 *
 * Read-only against storage, on purpose. It creates and updates catalogue rows
 * and never touches a file, so it can be run as often as you like and the worst
 * case is a stale row. A file that has vanished is MARKED missing rather than
 * deleted: a bucket hiccup or a half-finished listing must not be able to wipe
 * the catalogue, and a row that remembers a file we no longer have is more
 * useful than no row at all.
 *
 * Both stores are crawled because they genuinely differ today. R2 has been
 * primary for serving since the rollout, while the Supabase copy exists only so
 * the library has something to list. Recording which store holds what is how we
 * find out, file by file, whether the mirror can be switched off.
 */

const IMG = /\.(jpe?g|png|webp|gif|avif|heic)$/i;
const VID = /\.(mp4|mov|m4v|webm)$/i;

/** What a file IS, decided once from its prefix instead of by every caller. */
function scopeOf(key: string): { scope: string; kind: "photo" | "video" | "other"; editionId: string | null; bookingId: string | null } {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const mem = new RegExp(`^memories/(${uuid})(?:/p/(${uuid}))?/`).exec(key);
  if (mem) return { scope: "memories", kind: VID.test(key) ? "video" : "photo", editionId: mem[1], bookingId: mem[2] ?? null };
  const vid = new RegExp(`^_video/(${uuid})(?:/p/(${uuid}))?/`).exec(key);
  if (vid) return { scope: "trip_video", kind: VID.test(key) ? "video" : "photo", editionId: vid[1], bookingId: vid[2] ?? null };
  if (key.startsWith("_vidraw/")) return { scope: "video_raw", kind: "video", editionId: null, bookingId: null };
  if (key.startsWith("_thumb/")) return { scope: "thumb", kind: "photo", editionId: null, bookingId: null };
  if (key.startsWith("product-dev/")) return { scope: "product_dev", kind: IMG.test(key) ? "photo" : "other", editionId: null, bookingId: null };
  return { scope: "library", kind: VID.test(key) ? "video" : IMG.test(key) ? "photo" : "other", editionId: null, bookingId: null };
}

type Seen = { key: string; bytes: number | null; inR2: boolean; inSupabase: boolean };

/** Walk the Supabase bucket breadth-first; it has no recursive list. */
async function crawlSupabase(db: ReturnType<typeof createAdminClient>, out: Map<string, Seen>) {
  const queue: string[] = [""];
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const folder = queue.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await db.storage.from("assets").list(folder, { limit: 1000, offset });
      if (error || !data?.length) break;
      for (const f of data) {
        const key = folder ? `${folder}/${f.name}` : f.name;
        // A folder comes back with no id; a file always has one.
        if (!f.id) { queue.push(key); continue; }
        const prev = out.get(key);
        out.set(key, {
          key,
          bytes: (f.metadata?.size as number) ?? prev?.bytes ?? null,
          inR2: prev?.inR2 ?? false,
          inSupabase: true,
        });
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const seen = new Map<string, Seen>();

  if (r2VideoEnabled()) {
    const objs = await listUnderPrefix("");
    for (const o of objs) {
      seen.set(o.key, { key: o.key, bytes: o.size ?? null, inR2: true, inSupabase: false });
    }
  }
  await crawlSupabase(db, seen);

  /* ONE stamp for the whole run. Stamping each row as it is built would give
     them microsecond-different times, and the "not seen this round" query below
     compares against exactly this value: with per-row stamps it would mark rows
     the crawl had just confirmed. */
  const runAt = new Date().toISOString();
  const rows = [...seen.values()].map((f) => {
    const s = scopeOf(f.key);
    return {
      key: f.key,
      in_r2: f.inR2,
      in_supabase: f.inSupabase,
      kind: s.kind,
      bytes: f.bytes,
      scope: s.scope,
      edition_id: s.editionId,
      booking_id: s.bookingId,
      seen_at: runAt,
      missing_since: null,
      updated_at: runAt,
    };
  });

  const summary = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.scope] = (acc[r.scope] ?? 0) + 1;
    return acc;
  }, {});
  const bytesByScope = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.scope] = (acc[r.scope] ?? 0) + (r.bytes ?? 0);
    return acc;
  }, {});

  if (dryRun) {
    return NextResponse.json({
      dryRun: true, found: rows.length, byScope: summary, bytesByScope,
      onlyInSupabase: rows.filter((r) => r.in_supabase && !r.in_r2).length,
      onlyInR2: rows.filter((r) => r.in_r2 && !r.in_supabase).length,
    });
  }

  // Chunked so one huge bucket does not become one huge statement.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("media_assets").upsert(rows.slice(i, i + 500), { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message, wrote: i }, { status: 400 });
  }

  /* Anything the crawl did not see this round is marked, never removed. The
     mark is what makes a later cleanup a decision rather than a side effect. */
  const { data: stale } = await db.from("media_assets").select("id").is("missing_since", null).lt("seen_at", runAt);
  const staleIds = ((stale ?? []) as { id: string }[]).map((r) => r.id);
  for (let i = 0; i < staleIds.length; i += 500) {
    await db.from("media_assets").update({ missing_since: runAt }).in("id", staleIds.slice(i, i + 500));
  }

  return NextResponse.json({
    ok: true, indexed: rows.length, byScope: summary, bytesByScope,
    markedMissing: staleIds.length,
    onlyInSupabase: rows.filter((r) => r.in_supabase && !r.in_r2).length,
    onlyInR2: rows.filter((r) => r.in_r2 && !r.in_supabase).length,
  });
}
