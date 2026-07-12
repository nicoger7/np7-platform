import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { sendCampaignChunk } from "@/lib/email/campaign";

export const maxDuration = 300;

// POST /api/admin/campaigns/[id]/send — process one chunk (~600 recipients) and
// report progress; the composer loops this until { done: true }. Idempotent:
// already-sent recipients are skipped via the email_log dedupe claim, so
// retries/crashes never double-send.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  try {
    const result = await sendCampaignChunk(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
