import { NextRequest, NextResponse } from "next/server";
import { createApplication, type MediaKind } from "@/lib/signature";

export const runtime = "nodejs";

// POST /api/signature/apply — public guest application for a Signature Trip.
// Creates the row and, when a pitch is attached, returns a presigned R2 PUT URL
// the browser uploads the clip to next. Token-less/public by design (this is a
// promoted funnel), so it lives outside the /api/admin auth middleware.
export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const media = b.media && (b.media.kind === "video" || b.media.kind === "audio") && typeof b.media.contentType === "string"
    ? { kind: b.media.kind as MediaKind, contentType: b.media.contentType as string }
    : null;

  const res = await createApplication({
    name: typeof b.name === "string" ? b.name : "",
    email: typeof b.email === "string" ? b.email : "",
    phone: typeof b.phone === "string" ? b.phone : null,
    level: typeof b.level === "string" ? b.level : null,
    wants: typeof b.wants === "string" ? b.wants.slice(0, 4000) : null,
    motivation: typeof b.motivation === "string" ? b.motivation.slice(0, 4000) : null,
    media,
  });

  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ id: res.id, uploadUrl: res.uploadUrl });
}
