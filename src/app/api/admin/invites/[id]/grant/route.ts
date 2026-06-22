import { NextResponse } from "next/server";
import { grantInviteReward } from "@/lib/invites";

// Gated by middleware (the "invites" section). Issues the two-sided reward —
// an experience-scoped credit voucher to each side. Idempotent.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const err = await grantInviteReward(id);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  return NextResponse.json({ ok: true });
}
