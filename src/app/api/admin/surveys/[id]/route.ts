import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { getSurvey, updateSurvey, archiveSurvey } from "@/lib/surveys";

// GET /api/admin/surveys/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ survey });
}

// PUT /api/admin/surveys/:id — update survey fields.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const survey = await updateSurvey(id, body);
  if (!survey) return NextResponse.json({ error: "Could not save." }, { status: 400 });
  return NextResponse.json({ survey });
}

// DELETE /api/admin/surveys/:id — soft delete (archive).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  await archiveSurvey(id);
  return NextResponse.json({ ok: true });
}
