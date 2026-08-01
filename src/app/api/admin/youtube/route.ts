import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { fetchVideoText } from "@/lib/youtube";

/**
 * POST { url } — read a YouTube video as text.
 *
 * Deliberately does NOT structure anything: it hands the title and description
 * back so the admin can see and edit them before the AI touches them. A video
 * description is half spot knowledge and half timestamps, links and sponsor
 * copy, and only a human can tell which is which at a glance.
 */
export async function POST(request: NextRequest) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "Paste a YouTube link first." }, { status: 400 });

  const result = await fetchVideoText(url);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json(result);
}
