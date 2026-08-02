import { NextRequest, NextResponse } from "next/server";
import { joinSurveyByOpenToken } from "@/lib/surveys";

// POST /api/survey/join — public: someone with the survey's OPEN link leaves
// name + email and gets their personal invite token back. Token-gated like the
// rest of the survey surface (unguessable open_token); a hidden honeypot field
// swallows dumb bots without telling them.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const name = typeof body?.name === "string" ? body.name : "";
  const email = typeof body?.email === "string" ? body.email : "";
  const honeypot = typeof body?.website === "string" ? body.website : "";
  const optIn = body?.optIn === true;
  if (honeypot.trim()) return NextResponse.json({ token: "thanks" }); // bot: pretend success, save nothing
  if (!token) return NextResponse.json({ error: "Missing link token." }, { status: 400 });

  const res = await joinSurveyByOpenToken(token, name, email, optIn);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ token: res.token });
}
