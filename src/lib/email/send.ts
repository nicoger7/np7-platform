import { createAdminClient } from "@/lib/supabase";
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
  /** Which brand sends this — picks the from/reply-to address AND the email theme. Defaults to experience. */
  division?: Division;
  /** Optional file attachments (Resend supports PDF, etc.). Best-effort — ignored if provider not configured. */
  attachments?: EmailAttachment[];
};

type SendResult = { status: "sent" | "failed" | "skipped"; id?: string; error?: string };

/**
 * Sign-up / login mail (the magic link) is purely transactional, user-triggered, and
 * carries no admin-entered booking data — so it's always allowed. Every other template
 * is automated customer lifecycle mail and stays suppressed during the soft launch until
 * EMAIL_LIFECYCLE_LIVE=true, because admin data may still be wrong.
 */
const SOFT_LAUNCH_ALLOWED = new Set(["account_magic_link"]);
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
  const { to, templateKey, vars, dedupeKey, bookingId, contactId, ruleId, attachments, division = "experience" } = args;

  // Soft-launch guard: only sign-up/login mail goes out; all automated customer
  // lifecycle mail is held until EMAIL_LIFECYCLE_LIVE=true. Returns BEFORE any DB
  // write so no dedupe_key is burned — the send fires for real once enabled.
  if (lifecycleSuppressed(templateKey)) {
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
  const useOverride = override && override.active !== false ? override : null;

  let subject = "";
  let html = "";
  try {
    const built = renderTemplate(templateKey, vars, useOverride, division, useOverride?.header_image || undefined);
    subject = built.subject;
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
