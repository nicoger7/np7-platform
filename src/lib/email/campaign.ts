import { createHmac, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase";
import { contactIdsFromBookings, hasBookingFilter, type BookingFilters } from "./audience-bookings";
import { emailLayout, normalizeEmailBody, SENDERS, type Division } from "./layout";

/**
 * Campaign (blast) email engine.
 *
 * - Audience = a saved jsonb filter over `contacts`, ALWAYS restricted to
 *   marketing_opt_in = true, email present, not archived.
 * - Sends are claimed by inserting `email_log` rows with
 *   dedupe_key `camp:<campaignId>:<contactId>` (ignore-duplicates upsert), so a
 *   campaign can never double-send and any crashed run resumes cleanly.
 * - Delivery via Resend's batch endpoint (100 emails/call) with one-click
 *   List-Unsubscribe headers (Gmail/Yahoo bulk-sender requirement).
 */

export type AudienceFilters = {
  segment?: "all" | "newsletter" | "crm";
  tags?: string[];         // any-of
  excludeTags?: string[];  // none-of — e.g. everyone EXCEPT the imported maillist
  locations?: string[];    // any-of, matches experience_locations
  countries?: string[];    // any-of
  /**
   * Who actually booked what. Tags are hand-maintained and drift (Garda's 2026
   * guests are tagged `Clinic`, not `Experience Participant`); bookings are
   * written by the act of booking and can't fall out of date.
   */
  bookings?: BookingFilters;
};

export type Campaign = {
  id: string;
  name: string;
  subject: string | null;
  preheader: string | null;
  body: string | null;
  division: Division;
  header_image: string | null;
  header_position: number | null;
  audience: AudienceFilters | null;
  status: string;
  recipient_count: number | null;
  sent_count: number;
  failed_count: number;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.np-seven.com";

// ── unsubscribe token ────────────────────────────────────────────────────────
function unsubSecret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    createHash("sha256").update("np7-unsub:" + (process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest("hex")
  );
}

/** HMAC token for a contact's unsubscribe link — unforgeable, no DB state. */
export function unsubscribeToken(contactId: string): string {
  return createHmac("sha256", unsubSecret()).update(contactId).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(contactId: string): string {
  return `${APP_URL}/api/unsubscribe?c=${contactId}&t=${unsubscribeToken(contactId)}`;
}

// ── audience ─────────────────────────────────────────────────────────────────
/** Base query: the saved filter + the always-enforced consent restrictions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function audienceQuery(db: any, f: AudienceFilters, select: string, opts?: { count?: boolean; ids?: string[] | null }) {
  let q = db
    .from("contacts")
    .select(select, opts?.count ? { count: "exact" } : undefined)
    .eq("marketing_opt_in", true)
    .not("email", "is", null)
    .is("archived_at", null);
  if (f.segment === "newsletter") q = q.contains("tags", ["maillist"]);
  else if (f.segment === "crm") q = q.or("tags.is.null,tags.not.cs.{maillist}");
  if (f.tags && f.tags.length) q = q.overlaps("tags", f.tags);
  if (f.excludeTags && f.excludeTags.length) q = q.not("tags", "ov", `{${f.excludeTags.join(",")}}`);
  if (f.locations && f.locations.length) q = q.overlaps("experience_locations", f.locations);
  if (f.countries && f.countries.length) q = q.in("country", f.countries);
  // Booking-derived ids are resolved by the caller (async) and intersected here.
  // An empty array means "filtered on bookings and matched nobody" — which must
  // narrow to zero, never widen to everyone.
  if (opts?.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  return q;
}

export async function countAudience(f: AudienceFilters): Promise<{ count: number; sample: { name: string; email: string }[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const ids = hasBookingFilter(f.bookings) ? await contactIdsFromBookings(f.bookings!) : null;
  const { count, error } = await audienceQuery(db, f, "id", { count: true, ids }).limit(1);
  if (error) throw new Error(error.message);
  const { data: sample } = await audienceQuery(db, f, "name,email", { ids }).order("created_at", { ascending: false }).limit(5);
  return { count: count ?? 0, sample: sample ?? [] };
}

/** Every contact id in the audience — used to stage survey invites. */
export async function audienceContactIds(f: AudienceFilters): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const ids = hasBookingFilter(f.bookings) ? await contactIdsFromBookings(f.bookings!) : null;
  const { data } = await audienceQuery(db, f, "id", { ids }).limit(5000);
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}

// ── rendering ────────────────────────────────────────────────────────────────
/**
 * Render the campaign shell ONCE with `{{firstName}}` / `{{unsubUrl}}` tokens
 * left in place; `personalize` then does two cheap string replaces per
 * recipient. A contact only gets a first name if their `name` looks real
 * (contains a space) — imported email-local-part handles greet generically.
 */
export function renderCampaignShell(c: Campaign): { subject: string; html: string } {
  const body = normalizeEmailBody(c.body || "", c.division);
  const html = emailLayout({
    division: c.division,
    preheader: c.preheader || "",
    headerImage: c.header_image || undefined,
    headerPosition: c.header_position,
    bodyHtml: body,
    unsubscribeUrl: "{{unsubUrl}}",
  });
  return { subject: c.subject || c.name, html };
}

export function firstNameOf(name: string | null | undefined): string {
  const n = (name || "").trim();
  return n.includes(" ") ? n.split(/\s+/)[0] : "";
}

export function personalize(shellHtml: string, subject: string, contact: { id: string; name: string | null }): { subject: string; html: string } {
  const first = firstNameOf(contact.name) || "there";
  return {
    subject: subject.replaceAll("{{firstName}}", first),
    html: shellHtml.replaceAll("{{firstName}}", first).replaceAll("{{unsubUrl}}", unsubscribeUrl(contact.id)),
  };
}

// ── sending ──────────────────────────────────────────────────────────────────
type ChunkResult = { sent: number; failed: number; remaining: number; total: number; done: boolean };

const RESEND_BATCH = 100;

/**
 * Process up to `chunkSize` recipients of a campaign. Safe to call repeatedly
 * (the admin UI loops it): already-sent recipients are skipped via the
 * email_log dedupe upsert. Marks the campaign `sent` when nothing remains.
 */
export async function sendCampaignChunk(campaignId: string, chunkSize = 600): Promise<ChunkResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY isn't set — add it to the environment first.");

  const { data: c, error: cErr } = await db.from("email_campaigns").select("*").eq("id", campaignId).single();
  if (cErr || !c) throw new Error(cErr?.message || "Campaign not found");
  const campaign = c as Campaign;
  const filters: AudienceFilters = campaign.audience || {};
  if (!campaign.body || !campaign.subject) throw new Error("Campaign needs a subject and a body before sending.");

  const { count: total } = await countAudience(filters);
  const { subject: shellSubject, html: shellHtml } = renderCampaignShell(campaign);
  const { from, replyTo } = SENDERS[campaign.division] ?? SENDERS.experience;

  if (campaign.status !== "sending" || campaign.recipient_count !== total) {
    await db.from("email_campaigns").update({ status: "sending", recipient_count: total, updated_at: new Date().toISOString() }).eq("id", campaignId);
  }

  let sent = 0;
  let failed = 0;
  const PAGE = 500;

  // Walk the audience from the start each run — claiming dedupes, so previously
  // handled pages cost one cheap upsert that returns nothing.
  for (let offset = 0; offset < total && sent + failed < chunkSize; offset += PAGE) {
    const { data: contacts, error: pErr } = await audienceQuery(db, filters, "id,name,email")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (pErr) throw new Error(pErr.message);
    if (!contacts || contacts.length === 0) break;

    // Claim: only rows that actually insert are ours to send this run.
    const logRows = contacts.map((ct: { id: string; email: string }) => ({
      template_key: "campaign",
      contact_id: ct.id,
      to_email: ct.email,
      subject: shellSubject,
      status: "queued",
      dedupe_key: `camp:${campaignId}:${ct.id}`,
    }));
    const { data: claimed, error: clErr } = await db
      .from("email_log")
      .upsert(logRows, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id,contact_id,to_email");
    if (clErr) throw new Error(clErr.message);
    if (!claimed || claimed.length === 0) continue;

    const byContact = new Map(contacts.map((ct: { id: string; name: string | null }) => [ct.id, ct]));
    for (let i = 0; i < claimed.length; i += RESEND_BATCH) {
      const slice = claimed.slice(i, i + RESEND_BATCH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emails = slice.map((row: any) => {
        const ct = byContact.get(row.contact_id) as { id: string; name: string | null } | undefined;
        const p = personalize(shellHtml, shellSubject, ct ?? { id: row.contact_id, name: null });
        return {
          from,
          to: row.to_email,
          reply_to: replyTo,
          subject: p.subject,
          html: p.html,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl(row.contact_id)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
      });
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(emails),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
        const ids: { id: string }[] = json?.data || [];
        const now = new Date().toISOString();
        await Promise.all(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          slice.map((row: any, idx: number) =>
            db.from("email_log").update({ status: "sent", provider_id: ids[idx]?.id ?? null, sent_at: now }).eq("id", row.id)
          )
        );
        sent += slice.length;
      } catch (e) {
        const msg = (e as Error).message;
        await Promise.all(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          slice.map((row: any) => db.from("email_log").update({ status: "failed", error: msg }).eq("id", row.id))
        );
        failed += slice.length;
      }
    }
  }

  // Progress = every log row for this campaign (includes previous runs).
  const { count: doneCount } = await db
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", `camp:${campaignId}:%`);
  const { count: failedCount } = await db
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", `camp:${campaignId}:%`)
    .eq("status", "failed");
  const remaining = Math.max(0, total - (doneCount ?? 0));
  const done = remaining === 0;
  await db.from("email_campaigns").update({
    sent_count: (doneCount ?? 0) - (failedCount ?? 0),
    failed_count: failedCount ?? 0,
    recipient_count: total,
    ...(done ? { status: "sent", sent_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);

  return { sent, failed, remaining, total, done };
}
