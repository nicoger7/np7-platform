import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { listUnderPrefix, deleteKeys, r2VideoEnabled } from "@/lib/r2-presign";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 3-month media retention. After a trip ends, the full gallery stays available
 * for RETENTION_DAYS; then everything is purged EXCEPT the starred "keepers"
 * (memory_stars) — the 3 photos + 3 videos per rider the uploader marked, kept
 * forever. Photos live in Supabase Storage (assets/memories/…), videos in R2
 * (_video/…).
 *
 * SAFE BY DEFAULT:
 *  • dry-run unless MEDIA_RETENTION_LIVE === "true" (reports what it WOULD delete)
 *  • only editions whose trip ended > RETENTION_DAYS ago
 *  • only editions that have ≥1 star (i.e. were curated) — an un-curated old trip
 *    is never nuked; it's reported so the team can go star keepers first
 *  • keepers are never deleted
 */

const RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS || 90);
const BUCKET = "assets";

function db() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured → allow (dev); set in prod
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret;
}

/** Recursively list every non-folder file under a Supabase Storage prefix. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listStorage(admin: any, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [prefix];
  let visited = 0;
  while (queue.length && visited < 300) {
    const dir = queue.shift()!;
    visited++;
    const { data } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
    for (const item of data || []) {
      if (item.name === ".emptyFolderPlaceholder") continue;
      const path = `${dir}/${item.name}`;
      if (!item.metadata || item.id === null) queue.push(path); // folder
      else out.push(path);
    }
  }
  return out;
}

/** Video stem = R2 key minus the _video/ root and the extension (matches the
    ref stored in memory_stars). */
function videoStem(key: string): string {
  return key.replace(/^_video\//, "").replace(/\.[^.]+$/, "");
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const live = process.env.MEDIA_RETENTION_LIVE === "true";
  const admin = db();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);

  // Editions whose trip ended more than RETENTION_DAYS ago.
  const { data: eds, error: edErr } = await admin
    .from("exp_editions").select("id, date_end").lt("date_end", cutoff);
  if (edErr) return NextResponse.json({ error: edErr.message }, { status: 500 });

  const report = {
    live, cutoff, editionsChecked: (eds ?? []).length,
    deletedPhotos: 0, deletedVideos: 0, keptPhotos: 0, keptVideos: 0,
    skippedUncurated: [] as string[],
  };

  for (const ed of (eds ?? []) as { id: string; date_end: string }[]) {
    // Keepers for this edition (all scopes).
    const { data: stars } = await admin.from("memory_stars").select("kind, ref").eq("edition_id", ed.id);
    const keepPhotos = new Set((stars ?? []).filter((s: { kind: string }) => s.kind === "photo").map((s: { ref: string }) => s.ref));
    const keepVideoStems = new Set((stars ?? []).filter((s: { kind: string }) => s.kind === "video").map((s: { ref: string }) => s.ref));

    // Never auto-purge an edition nobody curated — flag it instead.
    if ((stars ?? []).length === 0) { report.skippedUncurated.push(ed.id); continue; }

    // -- Photos (Supabase Storage) --
    const photoPaths = await listStorage(admin, `memories/${ed.id}`);
    const photosToDelete = photoPaths.filter((p) => !keepPhotos.has(p));
    report.keptPhotos += photoPaths.length - photosToDelete.length;
    if (live && photosToDelete.length) {
      for (let i = 0; i < photosToDelete.length; i += 100) {
        await admin.storage.from(BUCKET).remove(photosToDelete.slice(i, i + 100)).then(() => {}, () => {});
      }
    }
    report.deletedPhotos += photosToDelete.length;

    // -- Videos (R2 _video/) --
    if (r2VideoEnabled()) {
      const objs = await listUnderPrefix(`_video/${ed.id}/`).catch(() => []);
      const mp4s = objs.filter((o) => o.key.endsWith(".mp4"));
      const kill: string[] = [];
      for (const o of objs) {
        const stem = videoStem(o.key);
        if (keepVideoStems.has(stem)) continue; // keep mp4 + its poster
        kill.push(o.key);
      }
      const deletedClips = mp4s.filter((o) => !keepVideoStems.has(videoStem(o.key))).length;
      report.keptVideos += mp4s.length - deletedClips;
      if (live && kill.length) await deleteKeys(kill).catch(() => {});
      report.deletedVideos += deletedClips;
    }
  }

  return NextResponse.json({ ok: true, ...report });
}
