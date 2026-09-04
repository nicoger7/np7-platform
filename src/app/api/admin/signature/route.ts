import { NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { listApplications } from "@/lib/signature";
import { requireAdminGate } from "@/lib/admin-auth";
export const runtime = "nodejs";

// GET /api/admin/signature — all Signature-Trip applications with playback URLs.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  return NextResponse.json({ applications: await listApplications() });
}
