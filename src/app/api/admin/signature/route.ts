import { NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { listApplications } from "@/lib/signature";

export const runtime = "nodejs";

// GET /api/admin/signature — all Signature-Trip applications with playback URLs.
export async function GET() {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  return NextResponse.json({ applications: await listApplications() });
}
