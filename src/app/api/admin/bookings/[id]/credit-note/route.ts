import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { generateCreditNote } from "@/lib/invoices/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/bookings/:id/credit-note
 * Body: { documentId: string; amount?: number; reason: string }
 *
 * Issues a legally-shaped correction for ONE issued tax invoice — full Storno
 * when `amount` is omitted, partial credit otherwise. All validation (issued,
 * right booking, not a pro-forma, never crediting more than the original)
 * lives in generateCreditNote, so every caller gets the same rules.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;

  let body: { documentId?: string; amount?: number | string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.documentId) return NextResponse.json({ error: "Missing documentId — which invoice should be corrected?" }, { status: 400 });

  try {
    const document = await generateCreditNote({
      bookingId: id,
      originalDocumentId: body.documentId,
      amount: body.amount != null && body.amount !== "" ? Number(body.amount) : undefined,
      reason: String(body.reason ?? ""),
    });
    return NextResponse.json({ document });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create the credit note." }, { status: 400 });
  }
}
