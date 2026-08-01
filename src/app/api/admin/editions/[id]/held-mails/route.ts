import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { listOpenHolds, expireStaleHolds, daysLate, holdIsReady } from "@/lib/email/holds";
import { resolveEditionContent, MAIL_REQUIREMENTS } from "@/lib/email/readiness";

/** GET — open holds for this edition, with how late each one now is. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const { startDate } = await resolveEditionContent(id);

  // A pre-trip mail after the trip began is noise — close those out first so the
  // list only ever shows things still worth doing.
  await expireStaleHolds(id, startDate);

  const holds = await listOpenHolds(id);
  const ready = await holdIsReady(holds[0]?.template_key ?? "", id).catch(() => false);
  return NextResponse.json({
    startDate,
    contentReady: holds.length === 0 ? true : ready,
    holds: holds.map((h) => ({
      id: h.id,
      template: h.template_key,
      label: MAIL_REQUIREMENTS[h.template_key]?.label ?? h.template_key,
      bookingId: h.booking_id,
      missing: h.missing,
      daysLate: daysLate(h.template_key, startDate),
    })),
  });
}

/**
 * POST { holdIds } — send held mails late, on purpose.
 *
 * `manual: true` so it isn't suppressed by the soft-launch switch: an admin
 * pressing this button is a deliberate act, not the automated pipeline. The
 * original dedupe key is reused, so if the mail did somehow go out through the
 * normal window it still can't be sent twice.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const holdIds: string[] = Array.isArray(body.holdIds) ? body.holdIds.filter((x: unknown): x is string => typeof x === "string") : [];
  if (!holdIds.length) return NextResponse.json({ error: "Nothing selected." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { values, startDate } = await resolveEditionContent(id);

  const { data: holds } = await db.from("mail_holds").select("*").in("id", holdIds).eq("edition_id", id);
  if (!holds?.length) return NextResponse.json({ error: "Those holds are no longer open." }, { status: 404 });

  // Refuse rather than send another hollow mail — the content may still be missing.
  for (const h of holds) {
    if (!(await holdIsReady(h.template_key, id))) {
      return NextResponse.json(
        { error: `Still missing ${(h.missing ?? []).join(", ")} — fill it in first.` },
        { status: 400 },
      );
    }
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";
  const fmt = (x: string) => new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let sent = 0;
  const failed: string[] = [];

  for (const h of holds) {
    const { data: b } = await db
      .from("exp_bookings")
      .select("id, contact_id, contacts(name,email), exp_experiences(title), exp_editions(date_start,date_end,whatsapp_group_link)")
      .eq("id", h.booking_id)
      .maybeSingle();
    const email = b?.contacts?.email;
    if (!email) { failed.push(h.id); continue; }

    const s = b.exp_editions?.date_start as string | null;
    const e = b.exp_editions?.date_end as string | null;
    const res = await sendEmail({
      to: email,
      templateKey: h.template_key,
      manual: true,
      vars: {
        firstName: String(b.contacts?.name ?? "").split(" ")[0] || "there",
        experienceTitle: b.exp_experiences?.title,
        dates: s ? (e ? `${fmt(s)} – ${fmt(e)} ${new Date(e).getFullYear()}` : `${fmt(s)} ${new Date(s).getFullYear()}`) : undefined,
        preTripNote: values.preTripNote ?? undefined,
        packingList: values.packingList ?? undefined,
        whatsappLink: b.exp_editions?.whatsapp_group_link ?? values.whatsappLink ?? undefined,
        bookingLink: `${origin}/account`,
        tripLink: `${origin}/account/bookings/${b.id}`,
        waiverLink: `${origin}/account/bookings/${b.id}/waiver`,
      },
      bookingId: h.booking_id,
      contactId: b.contact_id,
      dedupeKey: h.dedupe_key,
    }).catch(() => ({ status: "error" as const }));

    if (res.status === "error") { failed.push(h.id); continue; }
    await db.from("mail_holds").update({ sent_at: new Date().toISOString() }).eq("id", h.id);
    sent++;
  }

  return NextResponse.json({ ok: true, sent, failed: failed.length, daysLate: daysLate(holds[0].template_key, startDate) });
}
