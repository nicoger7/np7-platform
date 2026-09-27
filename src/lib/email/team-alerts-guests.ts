import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { publicOrigin } from "@/lib/public-origin";
import { sumReceived } from "@/lib/payment-totals";
import { guestRequestsIn, GUEST_REQUEST_MARK } from "@/lib/guest-request";
import {
  recipientsFor, mailTeam, nobody, money, fmtRange, whoIs,
  type SweepResult,
} from "@/lib/email/team-alerts";

/**
 * The team hears about everything a guest does that someone has to act on
 * (Nico, 27 Sep 2026: "the team gets an email for EVERY sign-up and order").
 *
 * The first three alerts (a booking, an add-on request, a waiting-list sign-up)
 * live in team-alerts.ts and explain the approach. These follow it exactly:
 *
 *  · A SWEEP over the table, not a hook in the route, wherever a table records
 *    the event. Whoever writes the row, it is announced.
 *  · Deduped per recipient on what happened, so a run that overlaps the last
 *    one, or a cron that fires twice, announces nothing twice.
 *  · A window (six hours from the cron) so the first run cannot empty the
 *    history into an inbox.
 *  · Never to a guest. Every address comes from team_mail_recipients.
 *
 * The one exception is a failed or short bank transfer. Stripe tells the
 * webhook, and the payment-link row has no timestamp for when its status
 * changed, so there is nothing a sweep could window on. The webhook calls
 * announceTransferProblem() directly, and a failure there never touches the
 * webhook's answer to Stripe.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

const SIX_HOURS = 6 * 3600 * 1000;
const defaultSince = () => new Date(Date.now() - SIX_HOURS).toISOString();
const failed = (to: number, error: unknown): SweepResult =>
  ({ looked: 0, announced: 0, recipients: to, skipped: [String((error as { message?: string })?.message ?? error)] });

/** "28 Sep 2026, 14:05" in Berlin time, where the team is. */
export const fmtWhen = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
  });
};

/** The booking columns every guest alert prints. Embedded from a child table. */
const BOOKING_EMBED = "exp_bookings(id,name,contact_id,agreed_price,contacts(name,email),exp_experiences(title,currency),exp_editions(label,date_start,date_end))";

/** Trip, week and dates from a booking row, the same way in every mail. */
function tripVars(b: AnyRow) {
  return {
    experienceTitle: b?.exp_experiences?.title ?? "",
    editionLabel: b?.exp_editions?.label ?? "",
    dates: fmtRange(b?.exp_editions?.date_start, b?.exp_editions?.date_end) ?? "",
  };
}

/** Money received on a booking so far, from the ledger. Null when unknown. */
async function paidSoFar(db: Db, bookingId: string): Promise<number | null> {
  const { data, error } = await db.from("exp_payments").select("amount,type,direction,status").eq("booking_id", bookingId);
  if (error) return null;
  return sumReceived(data ?? []);
}

// ─── 1 · payment_received ────────────────────────────────────────────────────

/**
 * Which payment rows are "money just came in".
 *
 * Keyed on the ROW, never on a booking's paid flags: jibe's sheet sync rewrites
 * about eighty of those per run, and every one would look like a payment. Not on
 * provenance either: the event-ticket insert in the webhook sets none, so
 * `provenance = 'stripe'` would miss every clinic ticket.
 *
 *  · stripe with a `pi_` reference: the webhook's own row, one per PaymentIntent.
 *    A refund carries an `re_` reference and a negative amount, so it is out.
 *  · voucher: a gift voucher spent on a booking (the portal redeem route).
 * Bank transfers matched from the Qonto feed can join later, keyed the same way.
 */
export function isPaymentNews(p: {
  method?: string | null; reference?: string | null; type?: string | null;
  amount?: number | string | null; direction?: string | null; status?: string | null;
}): boolean {
  if (p.type === "refund" || p.direction === "cost") return false;
  if (p.status && p.status !== "paid") return false;
  if (!(Number(p.amount) > 0)) return false;
  if (p.method === "voucher") return true;
  return p.method === "stripe" && String(p.reference ?? "").startsWith("pi_");
}

const PAYMENT_KIND: Record<string, string> = {
  deposit: "Deposit", downpayment: "Down-payment", final: "Final payment", partial: "Part payment", addon: "Add-on",
};

function methodLabel(p: AnyRow): string {
  if (p.method === "voucher") return `Gift voucher ${p.reference ?? ""}`.trim();
  return /bank transfer/i.test(String(p.notes ?? "")) ? "Bank transfer through Stripe" : "Online through Stripe (card or wallet)";
}

export async function sweepPayments(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("payment_received");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("exp_payments")
    .select(`id,booking_id,amount,type,method,reference,notes,direction,status,created_at,${BOOKING_EMBED}`)
    .in("method", ["stripe", "voucher"])
    .gte("created_at", opts?.since ?? defaultSince())
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = ((data ?? []) as AnyRow[]).filter(isPaymentNews);
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const p of rows) {
    const b = p.exp_bookings ?? {};
    const cur = b.exp_experiences?.currency ?? "EUR";
    const sofar = p.booking_id ? await paidSoFar(db, p.booking_id) : null;
    await mailTeam(to, {
      event: "payment_received",
      what: p.id,
      templateKey: "team_payment_received",
      bookingId: p.booking_id ?? null,
      vars: {
        guestName: whoIs(b.contacts?.name, b.contacts?.email, "A guest"),
        guestEmail: b.contacts?.email ?? "",
        amount: money(p.amount, cur) ?? "",
        method: methodLabel(p),
        paymentKind: PAYMENT_KIND[String(p.type ?? "")] ?? "",
        ...tripVars(b),
        paidSoFar: sofar == null ? "" : `${money(sofar, cur)}${b.agreed_price ? ` of ${money(b.agreed_price, cur)}` : ""}`,
        adminLink: p.booking_id ? `${origin}/admin/bookings/${p.booking_id}` : `${origin}/admin/payments`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

// ─── 2 · transfer_failed (called by the Stripe webhook) ──────────────────────

/**
 * Stripe says a bank payment bounced, or only part of a transfer arrived.
 *
 * The guest believes they paid, and the spot is not held: exactly the thing a
 * person has to pick up the phone for, and until now it only reached the logs.
 * Called from the webhook, best effort: it catches everything itself, because
 * nothing about telling the team may change what the webhook answers Stripe.
 *
 * A link that is already PAID is left alone: a failure arriving after a late
 * success is old news. A short transfer is keyed on the amount that arrived, so
 * a second, different shortfall is a second mail and a redelivery is not.
 */
export async function announceTransferProblem(p: {
  kind: "failed" | "part_funded";
  linkId?: string | null;
  bookingId?: string | null;
  sessionId?: string | null;
  reason?: string | null;
  receivedCents?: number | null;
}): Promise<SweepResult> {
  try {
    const to = await recipientsFor("transfer_failed");
    if (!to.length) return nobody();
    const db: Db = createAdminClient();

    let link: AnyRow = null;
    if (p.linkId) {
      const { data } = await db.from("exp_payment_links").select("*").eq("id", p.linkId).maybeSingle();
      link = data ?? null;
    }
    if (link?.status === "paid") return { looked: 1, announced: 0, recipients: to.length, skipped: ["already paid"] };
    const bookingId: string | null = link?.booking_id ?? p.bookingId ?? null;
    if (!bookingId) return { looked: 0, announced: 0, recipients: to.length, skipped: ["no booking to point at"] };

    const { data: b } = await db.from("exp_bookings")
      .select("id,name,contacts(name,email),exp_experiences(title,currency),exp_editions(label,date_start,date_end)")
      .eq("id", bookingId).maybeSingle();
    const cur = link?.currency ?? b?.exp_experiences?.currency ?? "EUR";
    const guest = whoIs(b?.contacts?.name, b?.contacts?.email, "A guest");
    const asked = link?.amount != null ? Number(link.amount) : null;
    const received = p.receivedCents != null ? Math.round(p.receivedCents) / 100 : null;
    const short = asked != null && received != null ? Math.round((asked - received) * 100) / 100 : null;

    const part = p.kind === "part_funded";
    const tally = { announced: 0, skipped: [] as string[] };
    await mailTeam(to, {
      event: "transfer_failed",
      what: part
        ? `${p.linkId ?? bookingId}:part:${Math.round(p.receivedCents ?? 0)}`
        : `${p.linkId ?? p.sessionId ?? bookingId}`,
      templateKey: "team_transfer_failed",
      bookingId,
      vars: {
        guestName: guest,
        guestEmail: b?.contacts?.email ?? "",
        problemTitle: part ? "Transfer short" : "Payment failed",
        problemLine: part
          ? `Only part of ${guest}'s bank transfer arrived. It does not count until all of it is there, so the payment is still open.`
          : `${guest}'s payment did not go through. They probably think they have paid, and their spot is not held.`,
        ...tripVars(b),
        asked: money(asked, cur) ?? "",
        received: part ? money(received, cur) ?? "" : "",
        short: part && short != null && short > 0 ? money(short, cur) ?? "" : "",
        reason: !part && p.reason ? String(p.reason).slice(0, 240) : "",
        adminLink: `${publicOrigin()}/admin/bookings/${bookingId}`,
      },
    }, tally);
    return { looked: 1, ...tally, recipients: to.length };
  } catch (e) {
    return failed(0, e);
  }
}

// ─── 3 · guest_request ───────────────────────────────────────────────────────

/**
 * Requests guests send from their trip page. They live as stamped lines in the
 * booking notes (see lib/guest-request for why not as add-on rows), so this
 * reads the bookings touched in the window whose notes carry the marker, and
 * announces each line stamped inside it, keyed on the line.
 */
export async function sweepGuestRequests(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("guest_request");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const since = opts?.since ?? defaultSince();
  const { data, error } = await db
    .from("exp_bookings")
    .select("id,name,status,notes,updated_at,contacts(name,email),exp_experiences(title),exp_editions(label,date_start,date_end)")
    .gte("updated_at", since)
    .ilike("notes", `%${GUEST_REQUEST_MARK}%`)
    .order("updated_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  let looked = 0;
  for (const b of (data ?? []) as AnyRow[]) {
    for (const req of guestRequestsIn(b.notes, since)) {
      looked++;
      await mailTeam(to, {
        event: "guest_request",
        what: `${b.id}:${req.key}`,
        templateKey: "team_guest_request",
        bookingId: b.id,
        vars: {
          guestName: whoIs(b.contacts?.name || req.from, b.contacts?.email, "A guest"),
          guestEmail: b.contacts?.email ?? "",
          message: req.message.slice(0, 1000),
          sentAt: fmtWhen(req.at),
          ...tripVars(b),
          adminLink: `${origin}/admin/bookings/${b.id}`,
        },
      }, tally);
    }
  }
  return { looked, ...tally, recipients: to.length };
}

// ─── 4 · cancellation_requested ──────────────────────────────────────────────

/**
 * A guest pressed "Cancel this trip". The route writes a note and, since
 * migration 265, stamps cancellation_requested_at once. Nothing is cancelled or
 * refunded automatically, so until someone reads this the guest is waiting on
 * us, and the refund rule (deposit refundable, down-payment is the fee) is the
 * team's call to apply. A booking already lost by the time the sweep runs has
 * been dealt with.
 */
export async function sweepCancellationRequests(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("cancellation_requested");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("exp_bookings")
    .select("id,name,status,agreed_price,cancellation_requested_at,contacts(name,email),exp_experiences(title,currency),exp_editions(label,date_start,date_end)")
    .gte("cancellation_requested_at", opts?.since ?? defaultSince())
    .order("cancellation_requested_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = ((data ?? []) as AnyRow[]).filter((b) => String(b.status ?? "").toLowerCase() !== "lost");
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const b of rows) {
    const cur = b.exp_experiences?.currency ?? "EUR";
    const sofar = await paidSoFar(db, b.id);
    await mailTeam(to, {
      event: "cancellation_requested",
      what: `${b.id}:${b.cancellation_requested_at}`,
      templateKey: "team_cancellation_requested",
      bookingId: b.id,
      vars: {
        guestName: whoIs(b.contacts?.name, b.contacts?.email, "A guest"),
        guestEmail: b.contacts?.email ?? "",
        ...tripVars(b),
        bookingStatus: String(b.status ?? ""),
        paidSoFar: sofar == null ? "" : money(sofar, cur) ?? "",
        askedAt: fmtWhen(b.cancellation_requested_at),
        adminLink: `${origin}/admin/bookings/${b.id}`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

// ─── 5 · widerruf_received ───────────────────────────────────────────────────

/**
 * A withdrawal through the § 356a form. The row IS the legal act: its
 * created_at is the statutory time of receipt, and until now the only people
 * who heard about it were the consumer (their acknowledgment) and whoever next
 * opened /admin/widerrufe. One marked processed before the sweep got to it has
 * already been seen.
 */
export async function sweepWiderrufe(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("widerruf_received");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("withdrawal_requests")
    .select("id,created_at,name,contract_ref,email,note,status,ack_sent_at")
    .gte("created_at", opts?.since ?? defaultSince())
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = (data ?? []) as AnyRow[];
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const w of rows) {
    await mailTeam(to, {
      event: "widerruf_received",
      what: w.id,
      templateKey: "team_widerruf_received",
      vars: {
        guestName: whoIs(w.name, w.email),
        guestEmail: w.email ?? "",
        contractRef: w.contract_ref ?? "",
        receivedAt: fmtWhen(w.created_at),
        note: String(w.note ?? "").slice(0, 1000),
        ackLine: w.ack_sent_at ? "They have been sent the confirmation of receipt." : "The confirmation of receipt has not gone out to them yet.",
        adminLink: `${origin}/admin/widerrufe`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

// ─── 6 · account_signup ──────────────────────────────────────────────────────

/** How long an account gets to turn into a booking before we call it "no booking". */
export const SIGNUP_SETTLE_MS = 15 * 60 * 1000;

/**
 * Domains that are almost always a slip of the finger. The login link to one of
 * these never arrives, and the person thinks we never wrote back. Two of the
 * first 28 website sign-ups were exactly this (gamil.com, gmail.con).
 */
const TYPO_DOMAINS: Record<string, string> = {
  "gamil.com": "gmail.com", "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com",
  "gnail.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
  "gmail.de": "gmail.com", "googlemail.con": "googlemail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com",
  "gmx.dee": "gmx.de", "web.dee": "web.de", "icloud.con": "icloud.com", "iclod.com": "icloud.com",
};

/** "gmail.com" when the address looks like a typo of it, else null. */
export function likelyTypo(email?: string | null): string | null {
  const domain = String(email ?? "").toLowerCase().split("@")[1]?.trim() ?? "";
  if (!domain) return null;
  if (TYPO_DOMAINS[domain]) return TYPO_DOMAINS[domain];
  if (/\.(con|cmo|comm|coom|ocm)$/.test(domain)) return domain.replace(/\.[a-z]+$/, ".com");
  return null;
}

/**
 * Someone made an account and did not book.
 *
 * About three a week, warm leads nobody saw (Nico asked for sign-ups
 * explicitly). The trip registration uses the SAME contact source, so this
 * waits a quarter of an hour and then only announces contacts with no booking
 * row at all: a trip registration is announced as a booking and never twice.
 * Only website sign-ups: a Signature applicant, a voucher buyer or a group
 * companion arrives with a different source and has its own mail or none.
 */
export async function sweepAccountSignups(opts?: { since?: string; limit?: number; now?: number }): Promise<SweepResult> {
  const to = await recipientsFor("account_signup");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const now = opts?.now ?? Date.now();
  const { data, error } = await db
    .from("contacts")
    .select("id,name,email,source,created_at,auth_user_id,archived_at")
    .eq("source", "website-register")
    .not("auth_user_id", "is", null)
    .is("archived_at", null)
    .gte("created_at", opts?.since ?? new Date(now - SIX_HOURS).toISOString())
    .lte("created_at", new Date(now - SIGNUP_SETTLE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const contacts = (data ?? []) as AnyRow[];
  if (!contacts.length) return { looked: 0, announced: 0, recipients: to.length, skipped: [] };
  // One read for all of them. If it fails, say nothing rather than announce a
  // person who may well have booked: the next run tries again.
  const { data: booked, error: bookedErr } = await db
    .from("exp_bookings").select("contact_id").in("contact_id", contacts.map((c) => c.id));
  if (bookedErr) return failed(to.length, bookedErr);
  const hasBooking = new Set(((booked ?? []) as AnyRow[]).map((r) => r.contact_id));

  const rows = contacts.filter((c) => !hasBooking.has(c.id));
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const c of rows) {
    const typo = likelyTypo(c.email);
    await mailTeam(to, {
      event: "account_signup",
      what: c.id,
      templateKey: "team_account_signup",
      vars: {
        guestName: whoIs(c.name, c.email),
        guestEmail: c.email ?? "",
        signedUpAt: fmtWhen(c.created_at),
        typoLine: typo ? `The address may be a typo (did they mean ${typo}?). If so, their login link never reached them.` : "",
        adminLink: `${origin}/admin/contacts/${c.id}`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

// ─── 7 · signature_application ───────────────────────────────────────────────

/** A guest has a while to click their confirmation link, so this looks back further. */
export const SIGNATURE_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

/**
 * A Signature Trip application, once it is real.
 *
 * A guest applies unverified and clicks a magic link to confirm; a member is
 * verified on submit. Only verified rows are announced, so a made-up address
 * never reaches the team. There is no "verified at" column, and the click can
 * come a day after the form, so the window here is a week on created_at
 * (pass `since` to override) and the dedupe key does the rest. Only status
 * `new`: one already shortlisted has been seen. The two real applications so
 * far sat untouched for five weeks.
 */
export async function sweepSignatureApplications(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("signature_application");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("exp_trip_applications")
    .select("id,name,email,phone,level,wants,motivation,media_type,verified,status,created_at,archived_at")
    .eq("verified", true)
    .eq("status", "new")
    .is("archived_at", null)
    .gte("created_at", opts?.since ?? new Date(Date.now() - SIGNATURE_LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = (data ?? []) as AnyRow[];
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const a of rows) {
    await mailTeam(to, {
      event: "signature_application",
      what: a.id,
      templateKey: "team_signature_application",
      vars: {
        guestName: whoIs(a.name, a.email),
        guestEmail: a.email ?? "",
        phone: a.phone ?? "",
        wants: String(a.wants ?? "").slice(0, 300),
        level: a.level ?? "",
        pitch: a.media_type === "video" ? "Recorded a video pitch" : a.media_type === "audio" ? "Recorded a voice pitch" : "",
        motivation: String(a.motivation ?? "").slice(0, 1000),
        appliedAt: fmtWhen(a.created_at),
        adminLink: `${origin}/admin/applications`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

// ─── 8 · review_submitted ────────────────────────────────────────────────────

/**
 * A guest wrote a review, or changed one.
 *
 * Guest reviews always hang on a booking (the portal route requires one); a
 * review the team typed in the admin has none, so `booking_id` is what tells
 * them apart. A resubmit drops the review back to pending with a new
 * submitted_at, so the key is id + submitted_at: an edit alerts again, a rerun
 * does not.
 */
export async function sweepReviews(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("review_submitted");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("exp_reviews")
    .select(`id,booking_id,rating,quote,author_name,status,submitted_at,created_at,exp_experiences(title),exp_editions(label,date_start,date_end),${BOOKING_EMBED}`)
    .in("status", ["pending", "submitted"])
    .not("booking_id", "is", null)
    .gte("submitted_at", opts?.since ?? defaultSince())
    .order("submitted_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = (data ?? []) as AnyRow[];
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const r of rows) {
    const b = r.exp_bookings ?? {};
    const rating = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)));
    const edited = r.created_at && r.submitted_at
      && new Date(r.submitted_at).getTime() - new Date(r.created_at).getTime() > 60_000;
    await mailTeam(to, {
      event: "review_submitted",
      what: `${r.id}:${r.submitted_at}`,
      templateKey: "team_review_submitted",
      bookingId: r.booking_id,
      vars: {
        guestName: whoIs(r.author_name || b.contacts?.name, b.contacts?.email, "A guest"),
        guestEmail: b.contacts?.email ?? "",
        rating: rating ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating} of 5)` : "",
        quote: String(r.quote ?? "").slice(0, 1200),
        editedLine: edited ? "They changed a review they had already written." : "",
        experienceTitle: r.exp_experiences?.title ?? b.exp_experiences?.title ?? "",
        editionLabel: r.exp_editions?.label ?? b.exp_editions?.label ?? "",
        adminLink: `${origin}/admin/guest-reviews`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}
