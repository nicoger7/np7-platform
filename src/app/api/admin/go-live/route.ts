import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { runGoLiveChecks } from "@/lib/go-live";

export const dynamic = "force-dynamic";

/** Every experience and week, with what still stands between it and being sold. */
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  return NextResponse.json({ experiences: await runGoLiveChecks() });
}
