/**
 * /api/portal/bookings/[id]/pay/not-sent, "I have not sent this yet."
 *
 * The way out of the one dead end the bank transfer has. A guest presses Pay by
 * bank transfer, Stripe issues them an account number, and then they do not
 * send the money: they changed their mind, they mistyped, they would rather use
 * a card, or they simply closed the tab. The row sits at `awaiting`, which the
 * whole platform reads as money in the air, so the trip page stops asking and
 * every Pay button disappears until funds_due_by sweeps it. That is fourteen
 * days of a guest who wants to pay us being unable to.
 *
 * THIS IS NOT A CANCELLATION, AND THE COPY MUST NOT PRETEND IT IS. The guest is
 * telling us a fact about the past, no transfer left their bank, and we are
 * putting their payment back the way it was. Nothing is refunded, nothing is
 * charged, and the invoice is untouched.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not cancel the PaymentIntent and it
 * does not touch Stripe at all. The IBAN stays live, so a transfer they turn out
 * to have sent after all still arrives and is still recorded: the webhook's
 * linkForSession checks that the link exists, belongs to the booking and matches
 * the session, and does NOT look at status. That is exactly what makes this
 * safe. Anything that teaches the webhook to refuse a cancelled link turns this
 * feature into a way to lose a guest's money.
 *
 * WHICH ROWS. canSayNotSent (lib/bank-transfer) decides, and it is pure so the
 * rule can be asserted without a database. The short version: the guest's own
 * row, awaiting, with nothing received against it.
 *
 * Same rules as the pay route next door, because it is the same guest doing the
 * same job: allowPreview false, so an admin looking at a member's portal cannot
 * act in their name, and the booking must be theirs.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { canSayNotSent, type LinkRow, type NotSentVerdict } from "@/lib/bank-transfer";

export const dynamic = "force-dynamic";

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

/**
 * What the guest reads when we will not do it. Each one says what we are
 * keeping and where their money stands, because "we can't do that" to somebody
 * who thinks they may have sent four figures is how a support mail starts.
 */
const REFUSAL: Record<Exclude<NotSentVerdict, { ok: true }>["reason"], { msg: string; status: number }> = {
  missing: { msg: "We can't find that payment on your booking. Reload the page and it will show you where things stand.", status: 404 },
  "not-theirs": { msg: "We set that transfer up for you rather than you starting it here. Reply to the email it came with and we'll sort it out.", status: 409 },
  "already-arrived": { msg: "Some of that money has already reached us, so we've kept it and put it towards your trip. Whatever is left is on your payment plan below, and you can pay it however suits you.", status: 409 },
  "not-waiting": { msg: "That payment isn't waiting on a transfer any more. Reload the page and it will show you where it stands.", status: 409 },
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // allowPreview: false. An admin looking at a member's portal must not be
  // able to put words in their mouth about money they did or did not send.
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return bad("Unauthorized", 401);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const linkId = typeof body.linkId === "string" ? body.linkId.trim() : "";
  if (!linkId) return bad("We need to know which payment you mean.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings").select("id, contact_id").eq("id", id).maybeSingle();
  // Same wording as the pay route: not "forbidden", which tells somebody
  // probing that the booking exists.
  if (!booking || booking.contact_id !== user.contactId) return bad("Booking not found.", 404);

  /* `amount_received` arrives with migration 247, the same one that introduces
     the `awaiting` status. A deployment without it has no awaiting rows, so no
     panel, so no button, so nothing can reach here. There is no older shape of
     this row to fall back to. */
  const { data: link, error: readErr } = await db.from("exp_payment_links")
    .select("id, amount, status, created_by, expires_at, session_id, amount_received")
    .eq("id", linkId).eq("booking_id", id).maybeSingle();
  if (readErr) {
    // Not knowing where their money stands is not a reason to write anything.
    console.error("[portal-not-sent] could not read the payment link:", readErr.message ?? readErr);
    return bad("We couldn't check that payment just now. Please try again in a moment.", 500);
  }

  const verdict = canSayNotSent(link as LinkRow | null);
  if (!verdict.ok) {
    const r = REFUSAL[verdict.reason];
    return bad(r.msg, r.status);
  }

  /*
   * The same conditions again, in the UPDATE, because the webhook may be
   * recording their transfer in the very second they press this. Losing that
   * race has to mean the money wins: the row only moves while it is still
   * awaiting and still theirs, and a row that moved on in between simply does
   * not match, so nothing is written over.
   *
   * Only the row. No expireCheckoutSession, no PaymentIntent cancel: see the
   * note at the top of this file.
   */
  const { data: moved, error: updErr } = await db.from("exp_payment_links")
    .update({ status: "cancelled", note: "The guest said they had not sent this transfer" })
    .eq("id", linkId).eq("booking_id", id).eq("status", "awaiting").eq("created_by", "member")
    .select("id");
  if (updErr) {
    console.error("[portal-not-sent] could not put the payment back:", updErr.message ?? updErr);
    return bad("We couldn't put that payment back just now. Please try again in a moment.", 500);
  }
  if (!moved?.length) {
    return bad("That transfer moved on while this page was open, most likely because your money reached us. Reload and it will show you where it stands.", 409);
  }
  return NextResponse.json({ ok: true });
}
