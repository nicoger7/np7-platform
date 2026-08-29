import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase";
import { isActiveTeamMember } from "@/lib/admin-auth";
import { listUnderPrefix, r2VideoEnabled } from "@/lib/r2-presign";

/**
 * How much is actually in storage.
 *
 * Read from `storage.objects` rather than by listing the bucket: the sizes are
 * already recorded there, so this is one aggregate query instead of walking
 * thousands of keys — and it stays fast as the library grows, which a listing
 * would not.
 *
 * Returns the whole bucket broken down by top-level folder, so "memories" can
 * be shown on its own without a second round trip.
 *
 * Videos are counted SEPARATELY, out of R2, because they only exist there —
 * photos are uploaded to R2 and mirrored into this bucket, so adding the two
 * totals together would count every photograph twice. What is reported is
 * therefore: the catalogue (photos, once) plus the video library (R2 only).
 * R2's derived copies — the photo mirror and `_thumb/` — are real storage but
 * not more MEDIA, so they stay out of the headline.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scoped to one edition — what THIS week's memories occupy, which is the
  // number that means something on the week's own page. Whole-bucket totals
  // still come back when no edition is named.
  const editionId = request.nextUrl.searchParams.get("editionId");

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    if (editionId) {
      const { data: photoRows } = await admin.rpc("storage_usage_for_prefix", { p_prefix: `memories/${editionId}/` });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ph = ((photoRows ?? []) as any[])[0] ?? { files: 0, bytes: 0 };
      const photos = { files: Number(ph.files ?? 0), bytes: Number(ph.bytes ?? 0) };
      let video = { files: 0, bytes: 0 };
      if (r2VideoEnabled()) {
        try {
          const [done, raw] = await Promise.all([
            listUnderPrefix(`_video/${editionId}/`),
            listUnderPrefix(`_vidraw/${editionId}/`),
          ]);
          const all = [...done, ...raw];
          video = { files: all.length, bytes: all.reduce((n, o) => n + (o.size || 0), 0) };
        } catch { /* a usage number must never break the page */ }
      }
      return Response.json({
        scope: "edition",
        photos,
        video,
        combined: { files: photos.files + video.files, bytes: photos.bytes + video.bytes },
      });
    }

    const { data, error } = await admin.rpc("storage_usage_by_folder");
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map((r) => ({
      folder: String(r.folder ?? ""),
      files: Number(r.files ?? 0),
      bytes: Number(r.bytes ?? 0),
    }));
    const total = rows.reduce((a, r) => ({ files: a.files + r.files, bytes: a.bytes + r.bytes }), { files: 0, bytes: 0 });

    // Videos live only in R2, so they need a listing — bounded, and never
    // allowed to fail the whole read-out.
    let video: { files: number; bytes: number } | null = null;
    if (r2VideoEnabled()) {
      try {
        const [done, raw] = await Promise.all([listUnderPrefix("_video/"), listUnderPrefix("_vidraw/")]);
        const all = [...done, ...raw];
        video = { files: all.length, bytes: all.reduce((n, o) => n + (o.size || 0), 0) };
      } catch { video = null; }
    }

    return Response.json({
      folders: rows,
      total,
      video,
      // What the two together actually occupy, which is the number to watch.
      combined: { files: total.files + (video?.files ?? 0), bytes: total.bytes + (video?.bytes ?? 0) },
    });
  } catch {
    // Never break the page over a usage read-out.
    return Response.json({ folders: [], total: null, video: null, combined: null });
  }
}
