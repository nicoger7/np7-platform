import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { resizeForStorage } from "@/lib/image-resize";

export const runtime = "nodejs"; // sharp (image resize) needs the Node runtime
const BUCKET = "assets";
const MAX = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/portal/spotguide/photo — a member uploads a photo for a spot
 * (multipart: file, spotId). Lands in spot_photos as 'pending' for moderation.
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
  const path = `spots/${spotId}/member/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // Downscale before storing so a phone shot doesn't sit at 10 MB and burn egress on every view.
  const { body, contentType } = await resizeForStorage(file);
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (upErr) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  // Member photos auto-show (status 'approved'); members up/down-vote them and a
  // few flags will auto-hide one for NP7 review.
  const { error } = await db.from("spot_photos").insert({
    spot_id: spotId, contact_id: user.contactId, url, caption, source: "member", status: "approved",
  });
  if (error) return NextResponse.json({ error: "Could not save the photo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
