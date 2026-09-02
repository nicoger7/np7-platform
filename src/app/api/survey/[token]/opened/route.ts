import { NextResponse } from "next/server";
import { markSurveyInviteOpened } from "@/lib/surveys";

// POST /api/survey/:token/opened — the browser says a person is looking at it.
// Public + token-authed, same as the response route: the token IS the identity.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await markSurveyInviteOpened(token).catch(() => {});
  return NextResponse.json({ ok: true });
}
