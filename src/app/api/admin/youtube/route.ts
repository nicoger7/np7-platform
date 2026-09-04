import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { fetchVideoText } from "@/lib/youtube";
import { requireAdminGate } from "@/lib/admin-auth";
/**
 * POST { url } — read a YouTube video as text.
 *
 * Deliberately does NOT structure anything: it hands the title and description
 * back so the admin can see and edit them before the AI touches them. A video
 * description is half spot knowledge and half timestamps, links and sponsor
 * copy, and only a human can tell which is which at a glance.
 *
 * When the page won't give up a description, the answer isn't an API key — it's
 * jibe. The link goes into the same intake queue jibe already drains for free
 * text it couldn't structure on the spot, and it watches the video on its next
 * run. Nothing is lost and nothing needs configuring.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "Paste a YouTube link first." }, { status: 400 });

  const result = await fetchVideoText(url);

  // No usable text — hand the video to jibe rather than fail at the admin.
  if ("error" in result || !result.description.trim()) {
    const title = "error" in result ? "" : result.title;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("spot_intake_queue").insert({
      text: [
        `YouTube video to research for a windsurf spot: ${url}`,
        title ? `Video title: ${title}` : "",
        "Watch it and extract the spot: name, area, launch, conditions, levels, hazards, crowd, season.",
      ].filter(Boolean).join("\n"),
    });
    if (error) return NextResponse.json({ error: `Couldn't hand it to jibe: ${error.message}` }, { status: 400 });
    return NextResponse.json({ queued: true, title });
  }

  return NextResponse.json(result);
}
