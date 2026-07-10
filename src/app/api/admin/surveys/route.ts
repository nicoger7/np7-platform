import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { listSurveys, createSurvey } from "@/lib/surveys";

// GET /api/admin/surveys — all surveys with invited/responded counts.
export async function GET() {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  return NextResponse.json({ surveys: await listSurveys() });
}

// POST /api/admin/surveys — create a survey (draft).
export async function POST(request: NextRequest) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const body = await request.json().catch(() => ({}));
  const survey = await createSurvey(body);
  if (!survey) return NextResponse.json({ error: "Could not create the survey." }, { status: 400 });
  return NextResponse.json({ survey });
}
