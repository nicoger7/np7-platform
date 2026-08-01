import { createAdminClient } from "@/lib/supabase";
import { CANNOT_DISABLE } from "@/lib/email/automations";
import { resolveHeaderImage } from "./header-image";
import { renderTemplate, type EmailVars } from "./templates";
import { SENDERS, type Division } from "./layout";

/** A single email attachment (Resend format). */
export type EmailAttachment = {
  /** Filename shown to the recipient, e.g. "deposit-invoice.pdf". */
  filename: string;
  /** Raw file contents as a Buffer or base64 string. */
  content: Buffer | string;
};

type SendArgs = {
  to: string;
  templateKey: string;
  vars: EmailVars;
  /** stable key — a second send with the same key is skipped (idempotent) */
  dedupeKey?: string;
  bookingId?: string | null;
  contactId?: string | null;
  ruleId?: string | null;
  /** Experience this mail is about — its hero photo becomes the email header.
   *  If omitted, it's resolved from bookingId. General mails (none) use the
   *  template's admin image, then the default. */
  experienceId?: string | null;
  /** Which brand sends this — picks the from/reply-to address AND the email theme. Defaults to experience. */
  division?: Division;
  /** Optional file attachments (Resend supports PDF, etc.). Best-effort — ignored if provider not configured. */
  attachments?: EmailAttachment[];
  /** Explicitly human-triggered from the admin (a button press, e.g. the photo
   *  reminder) — bypasses the lifecycle soft-launch hold, which only guards
   *  AUTOMATED sends against half-migrated data. */
  manual?: boolean;
  /** Replaces the template's subject line (body untouched) — e.g. a survey
   *  reminder re-sends the same email under a fresh subject. */
  subjectOverride?: string;
};

type SendResult = { status: "sent" | "failed" | "skipped"; id?: string; error?: string };

/**
 * Sign-up / login mail (the magic link) is purely transactional, user-triggered, and
 * carries no admin-entered booking data — so it's always allowed. Every other template
 * is automated customer lifecycle mail and stays suppressed during the soft launch until
 * EMAIL_LIFECYCLE_LIVE=true, because admin data may still be wrong.
 */
// trip_invite is member-triggered and transactional (the member explicitly sends
// it to a friend) — like the magic link, it carries no automated lifecycle data,
// so it's allowed during the soft launch.
// withdrawal_received is the § 356a BGB acknowledgment — consumer-triggered and
// legally required, so it must go out even during the soft launch.
const SOFT_LAUNCH_ALLOWED = new Set(["account_magic_link", "reservation_received", "trip_invite", "voucher_purchased", "voucher_gift", "cancellation_confirmed", "invoice_sent", "payment_shortfall_reminder", "withdrawal_received"]);
function lifecycleSuppressed(templateKey: string): boolean {
  const live = process.env.EMAIL_LIFECYCLE_LIVE === "true" || process.env.EMAIL_LIFECYCLE_LIVE === "1";
  return !live && !SOFT_LAUNCH_ALLOWED.has(templateKey);
}

/**
 * Send one transactional email through Resend and record it in `email_log`.
 *
 * - Idempotent: a row with the same `dedupe_key` already present → "skipped".
 * - Graceful: no RESEND_API_KEY → logged as "skipped" (nothing breaks in dev).
 * - DB template_key override (email_templates row) wins over the code default.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const { to, templateKey, vars, dedupeKey, bookingId, contactId, ruleId, attachments, experienceId, division = "experience" } = args;

  // Soft-launch guard: only sign-up/login mail goes out; all automated customer
  // lifecycle mail is held until EMAIL_LIFECYCLE_LIVE=true. Returns BEFORE any DB
  // write so no dedupe_key is burned — the send fires for real once enabled.
  // `manual` sends (an admin pressing a button) are deliberate and go out always.
  if (!args.manual && lifecycleSuppressed(templateKey)) {
    return { status: "skipped", error: "soft launch: lifecycle email suppressed (set EMAIL_LIFECYCLE_LIVE=true to enable)" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // optional DB override (select * so a not-yet-migrated header_image column can't error)
  const { data: override } = await db
    .from("email_templates")
    .select("*")
    .eq("template_key", templateKey)
    .maybeSingle();
  // Per-email master switch. Off means off — including a manual press, because
  // an admin who switched this mail off doesn't want it leaving by another door.
  // Returns before any DB write, so the dedupe key stays unburned and the mail
  // can still fire for real if it's switched back on in time.
  //
  // CANNOT_DISABLE is the exception: the magic link IS how members sign in, so
  // switching it off would lock them out of their own account with no clue why.
  if (override?.enabled === false && !CANNOT_DISABLE.has(templateKey)) {
    return { status: "skipped", error: `"${templateKey}" is switched off in Emails` };
  }

  const useOverride = override && override.active !== false ? override : null;

  // Header image: this week's hero, else the experience's, else the template's,
  // else the division default. Shared with the email-log preview so the log
  // can't show a different photo from the one that actually went out.
  const { headerImage, headerPosition } = await resolveHeaderImage({
    bookingId, experienceId, division, override: useOverride,
  });

  let subject = "";
  let html = "";
  try {
    const built = renderTemplate(templateKey, vars, useOverride, division, headerImage, headerPosition);
    subject = args.subjectOverride?.trim() || built.subject;
    html = built.html;
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const { from, replyTo } = SENDERS[division];

  // No provider configured → skip WITHOUT claiming the dedupe_key, so the email
  // still goes out once a key is added (never burn idempotency keys on a no-op).
  if (!apiKey) return { status: "skipped" };

  // insert log row first (dedupe guard)
  const logRow = {
    template_key: templateKey,
    rule_id: ruleId ?? null,
    booking_id: bookingId ?? null,
    contact_id: contactId ?? null,
    to_email: to,
    subject,
    status: "queued" as string,
    dedupe_key: dedupeKey ?? null,
    // for the log's hover preview (re-rendered on demand). Never store the
    // magic-link vars — they contain the live login token.
    vars: templateKey === "account_magic_link" ? null : (vars ?? null),
  };
  const { data: inserted, error: insErr } = await db.from("email_log").insert(logRow).select("id").single();
  if (insErr) {
    // 23505 = unique violation on dedupe_key → already handled
    if (insErr.code === "23505") return { status: "skipped" };
    return { status: "failed", error: insErr.message };
  }
  const logId = inserted.id as string;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
          from,
          to,
          reply_to: replyTo,
          subject,
          html,
          ...(attachments && attachments.length > 0
            ? {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  content:
                    Buffer.isBuffer(a.content)
                      ? a.content.toString("base64")
                      : a.content,
                })),
              }
            : {}),
        }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      await db.from("email_log").update({ status: "failed", error: json?.message ?? `HTTP ${res.status}` }).eq("id", logId);
      return { status: "failed", error: json?.message };
    }
    await db.from("email_log").update({ status: "sent", provider_id: json?.id ?? null, sent_at: new Date().toISOString() }).eq("id", logId);
    return { status: "sent", id: json?.id };
  } catch (e) {
    await db.from("email_log").update({ status: "failed", error: (e as Error).message }).eq("id", logId);
    return { status: "failed", error: (e as Error).message };
  }
}
