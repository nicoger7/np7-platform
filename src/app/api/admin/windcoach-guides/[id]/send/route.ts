import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";
import { resolveHeaderImage } from "@/lib/email/header-image";

/**
 * Send (or preview) ONE rider's training-guide email.
 *
 * Guides arrive from wind.coach and are checked by a human before they go out —
 * a guide is a coach's personal read of someone's sailing, and a wrong one
 * reaching the wrong rider is worse than a late one. So this is deliberately
 * manual: GET renders the exact mail for review, POST sends that same mail.
 *
 * GET  ?preview=1 → the rendered HTML (what the rider will see)
 *      otherwise  → { recipient, name, tripLabel, lastSent, ready }
 * POST → sends it. `manual: true`, so it ignores the lifecycle soft-launch hold.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const TEMPLATE = "guide_ready";

/** Everything the mail needs, resolved from the guide + its booking. */
async function context(guideId: string) {
  const db = createAdminClient() as any;
  const { data: g } = await db
    .from("windcoach_guides")
    .select("id,status,booking_id,email,name,trip_label,focus_points")
    .eq("id", guideId)
    .maybeSingle();
  if (!g) return null;

  let booking: any = null;
  if (g.booking_id) {
    const { data } = await db
      .from("exp_bookings")
      .select("id,name,contacts(name,email),exp_experiences(id,title),exp_editions(label,hero_image)")
      .eq("id", g.booking_id)
      .maybeSingle();
    booking = data ?? null;
  }
  // The guide's own email is the fallback identity for a guide that was
  // attached by hand to a booking whose contact has no address on file.
  const to = booking?.contacts?.email || g.email || null;
  const points = (Array.isArray(g.focus_points) ? g.focus_points : [])
    .map((fp: any) => String(fp?.title ?? "").trim())
    .filter(Boolean);
  return { db, g, booking, to, points };
}

function vars(ctx: NonNullable<Awaited<ReturnType<typeof context>>>, origin: string) {
  const { g, booking, points } = ctx;
  const name = booking?.contacts?.name ?? g.name ?? "";
  return {
    firstName: String(name).split(" ")[0] || undefined,
    experienceTitle: booking?.exp_experiences?.title ?? g.trip_label ?? undefined,
    editionLabel: booking?.exp_editions?.label ?? undefined,
    guidePoints: points.join("\n"),
    guideUrl: `${origin}/account/guides/${g.id}`,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const ctx = await context(id);
  if (!ctx) return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  const origin = publicOrigin();

  if (req.nextUrl.searchParams.get("preview")) {
    // Same header resolution the real send uses (this week's hero → the
    // experience's → the template's → the division default), so the preview
    // can never show a different photo from the one that goes out.
    const { headerImage, headerPosition } = await resolveHeaderImage({
      bookingId: ctx.g.booking_id ?? undefined,
      experienceId: ctx.booking?.exp_experiences?.id ?? undefined,
      division: "experience",
    });
    const built = renderTemplate(TEMPLATE, vars(ctx, origin), null, "experience", headerImage, headerPosition);
    return new NextResponse(built.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const { data: log } = await ctx.db
    .from("email_log")
    .select("sent_at,created_at")
    .eq("template_key", TEMPLATE)
    .eq("status", "sent")
    .eq("booking_id", ctx.g.booking_id ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    recipient: ctx.to,
    name: ctx.booking?.contacts?.name ?? ctx.g.name ?? null,
    tripLabel: ctx.booking?.exp_experiences?.title ?? ctx.g.trip_label ?? null,
    points: ctx.points,
    lastSent: log?.[0]?.sent_at ?? log?.[0]?.created_at ?? null,
    // Only a guide that is actually attached is sendable: an unmatched guide
    // has no trip context and no verified rider behind the address.
    ready: ctx.g.status === "stored" && !!ctx.g.booking_id && !!ctx.to,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const ctx = await context(id);
  if (!ctx) return NextResponse.json({ error: "Guide not found." }, { status: 404 });
  if (ctx.g.status !== "stored" || !ctx.g.booking_id) {
    return NextResponse.json({ error: "Attach this guide to a booking first." }, { status: 400 });
  }
  if (!ctx.to) return NextResponse.json({ error: "No email address for this rider." }, { status: 400 });

  const res = await sendEmail({
    to: ctx.to,
    templateKey: TEMPLATE,
    manual: true,
    bookingId: ctx.g.booking_id,
    // Per GUIDE, not per day: re-sending the same guide is almost always a
    // double click. A genuinely revised guide arrives as a new row with a new
    // id, so it can be sent again on purpose.
    dedupeKey: `guide_ready:${ctx.g.id}`,
    experienceId: ctx.booking?.exp_experiences?.id ?? undefined,
    vars: vars(ctx, publicOrigin()),
  });
  if (res.status === "failed") {
    return NextResponse.json({ error: res.error ?? "Could not send." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: res.status, to: ctx.to });
}
