import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { MAIL_REQUIREMENTS, SEND_SCHEDULE, resolveEditionContent } from "@/lib/email/readiness";

/**
 * Mails the cron held back for missing content, and what happens to them next.
 *
 * Holding a mail is only half an answer: the cron's send windows are bounded on
 * both sides, so a mail held at day 21 can never fire again once you fill the
 * content in at day 10. Without this, "held" quietly means "lost".
 *
 * An open hold is therefore a task. Fill the content, then decide — send it late
 * on purpose, or let it expire. Packing info at day 10 still beats none; a
 * "final countdown" after the trip has started is just noise, so the choice
 * stays yours rather than a silent catch-up.
 */

export type MailHold = {
  id: string;
  template_key: string;
  booking_id: string;
  edition_id: string | null;
  dedupe_key: string;
  missing: string[];
  first_held_at: string;
  last_held_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

/** The cron calls this each time it holds a mail. Idempotent per (template, booking). */
export async function recordHold(h: {
  templateKey: string;
  bookingId: string;
  editionId: string | null;
  dedupeKey: string;
  missing: string[];
}): Promise<void> {
  try {
    await db().from("mail_holds").upsert(
      {
        template_key: h.templateKey,
        booking_id: h.bookingId,
        edition_id: h.editionId,
        dedupe_key: h.dedupeKey,
        missing: h.missing,
        last_held_at: new Date().toISOString(),
      },
      { onConflict: "template_key,booking_id" },
    );
  } catch {
    /* the hold is a convenience — never fail the cron run over it */
  }
}

/** Open holds for an edition, newest first. */
export async function listOpenHolds(editionId: string): Promise<MailHold[]> {
  try {
    const { data } = await db()
      .from("mail_holds")
      .select("*")
      .eq("edition_id", editionId)
      .is("sent_at", null)
      .is("resolved_at", null)
      .is("expired_at", null)
      .order("first_held_at", { ascending: false });
    return (data ?? []) as MailHold[];
  } catch {
    return [];
  }
}

/**
 * Close out holds that no longer make sense: the trip has started, so a
 * pre-trip mail would arrive after the thing it was preparing for.
 */
export async function expireStaleHolds(editionId: string, startDate: string | null): Promise<number> {
  if (!startDate || new Date(startDate).getTime() > Date.now()) return 0;
  try {
    const { data } = await db()
      .from("mail_holds")
      .update({ expired_at: new Date().toISOString() })
      .eq("edition_id", editionId)
      .is("sent_at", null)
      .is("resolved_at", null)
      .is("expired_at", null)
      .select("id");
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * How late a held mail would be if sent right now, in days past its scheduled
 * moment — the number that decides whether sending is still worth it.
 */
export function daysLate(templateKey: string, startDate: string | null, now = new Date()): number | null {
  const lead = SEND_SCHEDULE[templateKey as keyof typeof SEND_SCHEDULE];
  if (lead == null || !startDate) return null;
  const scheduled = new Date(startDate).getTime() - lead * 86_400_000;
  return Math.max(0, Math.round((now.getTime() - scheduled) / 86_400_000));
}

/** Whether every blocking requirement for a held mail is now satisfied. */
export async function holdIsReady(templateKey: string, editionId: string | null): Promise<boolean> {
  const req = MAIL_REQUIREMENTS[templateKey];
  if (!req || req.blocking.length === 0) return true;
  if (!editionId) return false;
  const { values } = await resolveEditionContent(editionId);
  return req.blocking.every((k) => !!values[k]);
}
