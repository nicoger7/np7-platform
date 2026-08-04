import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email/send";

/**
 * The Memories tab's "new photos are up" reminder.
 *
 * GET  → { recipients, lastSent } — how many riders would get it + when the last
 *        photos_ready email (auto or manual) went out for this edition.
 * POST → emails every participant of the edition the existing `photos_ready`
 *        template (their gallery link). Deduped per booking per DAY, so a double
 *        click can't double-send but tomorrow's genuinely-new batch can remind
 *        again. Admin-triggered → bypasses the lifecycle soft-launch hold.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Participants = bookings that actually get a gallery (secured or attended) with
// a contact email. Same audience the member area serves photos to.
async function participants(editionId: string) {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("exp_bookings")
    .select("id,name,status,contacts(name,email),exp_experiences(title)")
    .eq("edition_id", editionId)
    .in("status", ["confirmed", "paid", "attended"]);
  return ((data ?? []) as any[]).filter((b) => b.contacts?.email);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const rows = await participants(id);
  let lastSent: string | null = null;
  if (rows.length) {
    const db = createAdminClient() as any;
    const { data: log } = await db
      .from("email_log")
      .select("sent_at,created_at")
      .eq("template_key", "photos_ready")
      .eq("status", "sent")
      .in("booking_id", rows.map((b: any) => b.id))
      .order("created_at", { ascending: false })
      .limit(1);
    lastSent = log?.[0]?.sent_at ?? log?.[0]?.created_at ?? null;
  }
  return NextResponse.json({ recipients: rows.length, lastSent });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const origin = publicOrigin();
  const rows = await participants(id);
  const today = new Date().toISOString().slice(0, 10);

  let sent = 0, skipped = 0, failed = 0;
  for (const b of rows) {
    const res = await sendEmail({
      to: b.contacts.email,
      templateKey: "photos_ready",
      manual: true,
      bookingId: b.id,
      dedupeKey: `photos_ready_manual:${b.id}:${today}`,
      vars: {
        firstName: (b.contacts?.name ?? b.name ?? "").split(" ")[0] || undefined,
        experienceTitle: b.exp_experiences?.title,
        tripLink: `${origin}/account/bookings/${b.id}`,
      },
    });
    if (res.status === "sent") sent++;
    else if (res.status === "skipped") skipped++;
    else failed++;
  }
  return NextResponse.json({ ok: true, recipients: rows.length, sent, skipped, failed });
}
