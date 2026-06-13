import { createAdminClient } from "@/lib/supabase";
import { renderTemplate, type EmailVars } from "./templates";

type SendArgs = {
  to: string;
  templateKey: string;
  vars: EmailVars;
  /** stable key — a second send with the same key is skipped (idempotent) */
  dedupeKey?: string;
  bookingId?: string | null;
  contactId?: string | null;
  ruleId?: string | null;
};

type SendResult = { status: "sent" | "failed" | "skipped"; id?: string; error?: string };

/**
 * Send one transactional email through Resend and record it in `email_log`.
 *
 * - Idempotent: a row with the same `dedupe_key` already present → "skipped".
 * - Graceful: no RESEND_API_KEY → logged as "skipped" (nothing breaks in dev).
 * - DB template_key override (email_templates row) wins over the code default.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const { to, templateKey, vars, dedupeKey, bookingId, contactId, ruleId } = args;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // optional DB override
  const { data: override } = await db
    .from("email_templates")
    .select("subject_line, body, active")
    .eq("template_key", templateKey)
    .maybeSingle();

  let subject = "";
  let html = "";
  try {
    const built = renderTemplate(templateKey, vars, override?.active === false ? null : override);
    subject = built.subject;
    html = built.html;
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "NP7 Experience <hello@np-seven.com>";

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
      body: JSON.stringify({ from, to, subject, html }),
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
