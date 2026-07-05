import { NextRequest, NextResponse, after } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { resizeForStorage, makeThumb } from "@/lib/image-resize";
import { r2Enabled, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs"; // sharp (image resize) needs the Node runtime
const BUCKET = "assets";
const MAX = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/portal/spotguide/photo -- a member uploads a photo for a spot
 * (multipart: file, spotId). Lands in spot_photos as 'approved' for immediate
 * display; vote flags auto-hide for NP7 review.
 *
 * Upload destination (in priority order):
 *   1. Cloudflare R2  -- when r2Enabled() is true (zero-egress CDN)
 *   2. Supabase Storage -- fallback; image is still resized before storage
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to add a photo." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const spotId = String(form.get("spotId") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || null;
  if (!file) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (!spotId) return NextResponse.json({ error: "Missing spot." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Images only." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image is too large (max 10 MB)." }, { status: 400 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: spot } = await db.from("spots").select("id").eq("id", spotId).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const key = `spots/${spotId}/member/${timestamp}-${random}.${ext}`;

  // Downscale before storing so a phone shot doesn't sit at 10 MB and burn egress on every view.
  const { body, contentType } = await resizeForStorage(file);

  let url: string;

  if (r2Enabled()) {
    // -- Cloudflare R2 (primary) ---------------------------------------------
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(await file.arrayBuffer());
    try {
      url = await uploadToR2(buf, key, contentType);
    } catch {
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }
    // Generate and upload thumbnail in background (best-effort).
    after(async () => {
      try {
        const thumb = await makeThumb(file);
        if (thumb) await uploadToR2(thumb.body, `_thumb/${key}`, thumb.contentType);
      } catch { /* ignore */ }
    });
  } else {
    // -- Supabase Storage (fallback) -----------------------------------------
    const { error: upErr } = await admin.storage.from(BUCKET).upload(key, body, { contentType, upsert: false });
    if (upErr) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
  }

  // Member photos auto-show (status 'approved'); members up/down-vote them and
  // a few flags will auto-hide one for NP7 review.
  const { error } = await db.from("spot_photos").insert({
    spot_id: spotId, contact_id: user.contactId, url, caption, source: "member", status: "approved",
  });
  if (error) return NextResponse.json({ error: "Could not save the photo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
