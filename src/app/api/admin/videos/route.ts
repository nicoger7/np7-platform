import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { isActiveTeamMember } from "@/lib/admin-auth";
import {
  r2VideoEnabled, presignPut, listUnderPrefix, deleteKeys, cdnUrlFor,
  scopeFolder, safeName, type R2Object,
} from "@/lib/r2-presign";

export const runtime = "nodejs";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
  return user;
}

// Accepted upload container types (browser-recordable + common camera formats).
const OK_TYPES = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
  "video/mpeg", "video/x-msvideo", "video/3gpp", "video/x-m4v",
]);

/** Path after the root prefix, extension stripped — the identity shared by a
    raw upload and its compressed output (used to pair them across folders). */
function stem(key: string): string {
  return key.replace(/^_(vidraw|video)\//, "").replace(/\.[^.]+$/, "");
}

/** R2 prefix listing recurses, so the "Everyone" prefix (…/{editionId}/) also
    returns the per-participant …/p/{bookingId}/ subtree. Drop it unless we're
    explicitly listing one participant. */
function inScope(objs: R2Object[], editionId: string, bookingId?: string): R2Object[] {
  if (bookingId) return objs; // already a leaf prefix, nothing deeper
  const pSub = `/${editionId}/p/`;
  return objs.filter((o) => !o.key.includes(pSub));
}

type VideoItem = {
  stem: string; status: "ready" | "processing";
  url: string | null; poster: string | null;
  size: number; uploadedAt: string | null;
};

export async function GET(request: NextRequest) {
  try { await requireAuth(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  if (!r2VideoEnabled()) return Response.json({ videos: [], r2: false });

  const sp = request.nextUrl.searchParams;
  const editionId = sp.get("editionId") || "";
  const bookingId = sp.get("bookingId") || undefined;
  if (!editionId) return Response.json({ error: "editionId required" }, { status: 400 });

  const [rawAll, doneAll] = await Promise.all([
    listUnderPrefix(scopeFolder("_vidraw", editionId, bookingId) + "/"),
    listUnderPrefix(scopeFolder("_video", editionId, bookingId) + "/"),
  ]);
  const raw = inScope(rawAll, editionId, bookingId);
  const done = inScope(doneAll, editionId, bookingId);

  const readyByStem = new Map<string, { mp4?: R2Object; poster?: R2Object }>();
  for (const o of done) {
    const s = stem(o.key);
    const e = readyByStem.get(s) || {};
    if (o.key.endsWith(".mp4")) e.mp4 = o;
    else if (/\.(jpe?g|png|webp)$/i.test(o.key)) e.poster = o;
    readyByStem.set(s, e);
  }

  const items: VideoItem[] = [];
  for (const [s, e] of readyByStem) {
    if (!e.mp4) continue;
    items.push({
      stem: s, status: "ready", url: cdnUrlFor(e.mp4.key),
      poster: e.poster ? cdnUrlFor(e.poster.key) : null,
      size: e.mp4.size, uploadedAt: e.mp4.lastModified,
    });
  }
  // Raw files with no compressed counterpart yet = still processing on jibe's box.
  for (const o of raw) {
    const s = stem(o.key);
    if (readyByStem.get(s)?.mp4) continue;
    items.push({ stem: s, status: "processing", url: null, poster: null, size: o.size, uploadedAt: o.lastModified });
  }
  items.sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
  return Response.json({ videos: items, r2: true });
}

export async function POST(request: NextRequest) {
  try { await requireAuth(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  if (!r2VideoEnabled()) return Response.json({ error: "Video storage is not configured yet." }, { status: 503 });

  const { editionId, bookingId, filename, contentType, target } = await request.json().catch(() => ({}));
  if (!editionId || !filename || !contentType) {
    return Response.json({ error: "editionId, filename and contentType are required" }, { status: 400 });
  }

  const base = safeName(String(filename).replace(/\.[^.]+$/, ""));
  const stamp = Date.now();

  // Primary path: the browser already compressed the clip (WebCodecs) — presign
  // the final MP4 + its poster straight into the served _video/ tree. Nothing
  // else to do server-side; the clip is live the moment the PUTs finish.
  if (target === "video") {
    if (contentType !== "video/mp4") {
      return Response.json({ error: "Compressed uploads must be video/mp4" }, { status: 400 });
    }
    const folder = scopeFolder("_video", editionId, bookingId || undefined);
    const key = `${folder}/${stamp}-${base}.mp4`;
    const posterKey = `${folder}/${stamp}-${base}.jpg`;
    const [uploadUrl, posterUploadUrl] = await Promise.all([
      presignPut(key, "video/mp4"),
      presignPut(posterKey, "image/jpeg"),
    ]);
    return Response.json({ uploadUrl, key, posterUploadUrl, posterKey });
  }

  // Fallback path (browser without WebCodecs): raw original into _vidraw/,
  // compressed later by the optional worker script (plain node+ffmpeg).
  if (!OK_TYPES.has(contentType)) {
    return Response.json({ error: `Unsupported video type: ${contentType}` }, { status: 400 });
  }
  const ext = (filename.match(/\.[^.]+$/)?.[0] || ".mov").toLowerCase();
  const key = `${scopeFolder("_vidraw", editionId, bookingId || undefined)}/${stamp}-${base}${ext}`;
  const uploadUrl = await presignPut(key, contentType);
  return Response.json({ uploadUrl, key });
}

export async function DELETE(request: NextRequest) {
  try { await requireAuth(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  const { stem: s, editionId, bookingId } = await request.json().catch(() => ({}));
  if (!s || !editionId) return Response.json({ error: "stem and editionId required" }, { status: 400 });

  // stem is the path AFTER the scope folder; rebuild both roots and remove every
  // variant (raw original, compressed mp4, poster) so a delete is complete.
  const rawFolder = scopeFolder("_vidraw", editionId, bookingId || undefined);
  const vidFolder = scopeFolder("_video", editionId, bookingId || undefined);
  const [raw, done] = await Promise.all([
    listUnderPrefix(rawFolder + "/"),
    listUnderPrefix(vidFolder + "/"),
  ]);
  const target = inScope([...raw, ...done], editionId, bookingId || undefined)
    .filter((o) => stem(o.key) === s).map((o) => o.key);
  await deleteKeys(target);
  return Response.json({ deleted: target.length });
}
