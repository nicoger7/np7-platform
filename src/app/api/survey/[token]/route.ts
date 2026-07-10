import { NextRequest, NextResponse } from "next/server";
import { submitResponse, type SurveyAnswer } from "@/lib/surveys";

// POST /api/survey/:token — a member submits (or updates) their response.
// Public + token-authed: the secret token IS the identity, so this route sits
// outside the /api/admin middleware guard. Reads/writes run service-role.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.json().catch(() => ({}))) as SurveyAnswer;
  const answer: SurveyAnswer = {
    top_destination: typeof body.top_destination === "string" ? body.top_destination : null,
    other_destinations: Array.isArray(body.other_destinations) ? body.other_destinations.map(String) : [],
    weeks: Array.isArray(body.weeks) ? body.weeks.map(String) : [],
    budget_ok: body.budget_ok === "yes" || body.budget_ok === "maybe" || body.budget_ok === "no" ? body.budget_ok : null,
    budget_min: body.budget_min != null ? Number(body.budget_min) : null,
    budget_max: body.budget_max != null ? Number(body.budget_max) : null,
    looking_for: typeof body.looking_for === "string" ? body.looking_for.slice(0, 4000) : null,
  };
  const res = await submitResponse(token, answer);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
