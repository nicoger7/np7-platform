import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { getEditionReadiness } from "@/lib/email/readiness";

/** What this edition still needs before its scheduled mails can go out. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json(await getEditionReadiness(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not check readiness." }, { status: 500 });
  }
}
