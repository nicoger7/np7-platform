import { NextResponse } from "next/server";
import { markInviteOpened } from "@/lib/invites";

// POST /api/join/:token/opened — the browser says a person is looking at it.
// A link preview (WhatsApp, Slack, iMessage) only ever GETs, so it can't fake this.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await markInviteOpened(token).catch(() => {});
  return NextResponse.json({ ok: true });
}
