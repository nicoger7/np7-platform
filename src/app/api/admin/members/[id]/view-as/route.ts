import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { VIEW_AS_COOKIE } from "@/lib/auth";

// Marker cookie (readable client-side) so the portal chrome can show a preview
// banner and neutralise actions while an admin is viewing a member.
const PREVIEW_MARKER = "np7_preview";
const BASE = { path: "/", sameSite: "lax" as const, maxAge: 1800 }; // 30-min preview window

// POST /api/admin/members/:id/view-as — start a read-only preview of this member.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, id, { ...BASE, httpOnly: true });
  res.cookies.set(PREVIEW_MARKER, "1", { ...BASE, httpOnly: false });
  return res;
}

// DELETE — end the preview.
export async function DELETE() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(PREVIEW_MARKER, "", { path: "/", maxAge: 0 });
  return res;
}
