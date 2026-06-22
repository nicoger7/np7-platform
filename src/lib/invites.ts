import { createAdminClient } from "@/lib/supabase";
import { generateVoucherCode, redeemByFrom } from "@/lib/vouchers";
import { sendEmail } from "@/lib/email/send";

/**
 * "Invite a friend to a trip" — a two-sided-reward referral tied to a specific
 * edition/week. The inviter shares a tokenised link; a friend who signs up
 * through it has their booking attributed back to the invite. When admin grants
 * the reward, both sides receive an experience-scoped credit (gift_vouchers).
 *
 * All access here is service-role (admin client) — the public /join page is
 * server-rendered, so no anon client ever touches `trip_invites` (RLS on, no
 * policies, migration 050).
 */

/** Default reward each side gets, in the experience's currency. Overridable
 *  per edition via exp_editions.invite_reward_{friend,inviter}. */
export const DEFAULT_INVITE_REWARD_FRIEND = 50;
export const DEFAULT_INVITE_REWARD_INVITER = 50;

export type InviteStatus = "sent" | "opened" | "booked" | "expired" | "cancelled";
export type InviteRewardStatus = "pending" | "granted" | "void";

export type TripInvite = {
  id: string;
  token: string;
  inviter_contact_id: string | null;
  inviter_booking_id: string | null;
  experience_id: string | null;
  edition_id: string | null;
  package_id: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  note: string | null;
  status: InviteStatus;
  invited_contact_id: string | null;
  invited_booking_id: string | null;
  reward_friend_amount: number | null;
  reward_inviter_amount: number | null;
  reward_status: InviteRewardStatus;
  reward_inviter_voucher_id: string | null;
  reward_friend_voucher_id: string | null;
  opened_at: string | null;
  booked_at: string | null;
  created_at: string;
};

function slug(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

/** Readable, hard-to-guess token like `nico-3f9a2b`. */
export function generateInviteToken(firstName?: string): string {
  const rand = Math.random().toString(16).slice(2, 8);
  const base = slug(firstName || "");
  return base ? `${base}-${rand}` : rand + Math.random().toString(16).slice(2, 6);
}

/** Reward amounts for a trip: the edition override, else the code default. */
export function resolveRewards(edition: { invite_reward_friend?: number | null; invite_reward_inviter?: number | null } | null): { friend: number; inviter: number } {
  return {
    friend: edition?.invite_reward_friend ?? DEFAULT_INVITE_REWARD_FRIEND,
    inviter: edition?.invite_reward_inviter ?? DEFAULT_INVITE_REWARD_INVITER,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

/** Create an invite for one of the member's own bookings. */
export async function createInvite(input: {
  inviterContactId: string;
  inviterBookingId: string;
  experienceId: string | null;
  editionId: string | null;
  packageId: string | null;
  inviterFirstName?: string;
  inviteeName?: string | null;
  inviteeEmail?: string | null;
  note?: string | null;
}): Promise<TripInvite | null> {
  const db = createAdminClient() as DB;

  // Reward amounts snapshot from the edition (so later edits don't change a live invite).
  let rewards = { friend: DEFAULT_INVITE_REWARD_FRIEND, inviter: DEFAULT_INVITE_REWARD_INVITER };
  if (input.editionId) {
    const { data: ed } = await db.from("exp_editions").select("*").eq("id", input.editionId).maybeSingle();
    rewards = resolveRewards(ed ?? null);
  }

  // Unique token (retry on the rare clash).
  let token = generateInviteToken(input.inviterFirstName);
  for (let i = 0; i < 3; i++) {
    const { data: clash } = await db.from("trip_invites").select("id").eq("token", token).maybeSingle();
    if (!clash) break;
    token = generateInviteToken(input.inviterFirstName);
  }

  const { data, error } = await db
    .from("trip_invites")
    .insert({
      token,
      inviter_contact_id: input.inviterContactId,
      inviter_booking_id: input.inviterBookingId,
      experience_id: input.experienceId,
      edition_id: input.editionId,
      package_id: input.packageId,
      invitee_name: input.inviteeName || null,
      invitee_email: input.inviteeEmail || null,
      note: input.note || null,
      reward_friend_amount: rewards.friend,
      reward_inviter_amount: rewards.inviter,
    })
    .select("*")
    .single();
  if (error) return null;
  return data as TripInvite;
}

/** Invites the member created for a given booking, newest first. */
export async function getInvitesForBooking(bookingId: string): Promise<TripInvite[]> {
  const db = createAdminClient() as DB;
  const { data } = await db.from("trip_invites").select("*").eq("inviter_booking_id", bookingId).order("created_at", { ascending: false });
  return (data ?? []) as TripInvite[];
}

export type InviteLanding = {
  invite: TripInvite;
  inviterName: string | null;
  experience: { id: string; title: string; slug: string | null; currency: string | null; hero_image: string | null; description: string | null } | null;
  edition: { id: string; label: string | null; date_start: string | null; date_end: string | null; location: string | null; hero_image: string | null } | null;
  package: { id: string; name: string | null; price: number | null } | null;
};

/** Everything the public /join page needs. Marks the invite "opened" (best-effort). */
export async function getInviteLanding(token: string): Promise<InviteLanding | null> {
  const db = createAdminClient() as DB;
  const { data: invite } = await db.from("trip_invites").select("*").eq("token", token).maybeSingle();
  if (!invite) return null;

  if (invite.status === "sent") {
    await db.from("trip_invites").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", invite.id).then(() => {}, () => {});
  }

  const [inviter, exp, ed, pkg] = await Promise.all([
    invite.inviter_contact_id ? db.from("contacts").select("name").eq("id", invite.inviter_contact_id).maybeSingle() : Promise.resolve({ data: null }),
    invite.experience_id ? db.from("exp_experiences").select("id,title,slug,currency,hero_image,description").eq("id", invite.experience_id).maybeSingle() : Promise.resolve({ data: null }),
    invite.edition_id ? db.from("exp_editions").select("*").eq("id", invite.edition_id).maybeSingle() : Promise.resolve({ data: null }),
    invite.package_id ? db.from("exp_packages").select("id,name,price").eq("id", invite.package_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const firstName = String((inviter.data?.name ?? "")).trim().split(/\s+/)[0] || null;
  const e = ed.data;
  return {
    invite: invite as TripInvite,
    inviterName: firstName,
    experience: exp.data ?? null,
    edition: e ? { id: e.id, label: e.label ?? null, date_start: e.date_start ?? null, date_end: e.date_end ?? null, location: e.location ?? null, hero_image: e.hero_image ?? null } : null,
    package: pkg.data ?? null,
  };
}

/** Attribute a freshly-created booking to an invite (called from /api/register).
 *  Marks the invite "booked" and stamps the booking's invite_id. Tolerant: never
 *  throws into the registration flow. */
export async function attachBookingToInvite(token: string, invitedContactId: string, invitedBookingId: string): Promise<void> {
  const db = createAdminClient() as DB;
  try {
    const { data: invite } = await db.from("trip_invites").select("id,status,inviter_contact_id").eq("token", token).maybeSingle();
    if (!invite) return;
    // Don't let someone attribute their own booking to their own invite.
    if (invite.inviter_contact_id && invite.inviter_contact_id === invitedContactId) return;
    await db.from("trip_invites").update({
      status: "booked",
      invited_contact_id: invitedContactId,
      invited_booking_id: invitedBookingId,
      booked_at: new Date().toISOString(),
    }).eq("id", invite.id);
    await db.from("exp_bookings").update({ invite_id: invite.id }).eq("id", invitedBookingId).then(() => {}, () => {});
  } catch {
    /* attribution is best-effort */
  }
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const mon = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  if (e && s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return `${s.getDate()}–${e.getDate()} ${mon(e)} ${e.getFullYear()}`;
  if (e) return `${s.getDate()} ${mon(s)} – ${e.getDate()} ${mon(e)} ${e.getFullYear()}`;
  return s.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMoney(n: number | null | undefined, currency = "EUR"): string {
  if (n == null) return "";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

/** Email a branded invite (with the join link) to invitee_email. Member-triggered
 *  and transactional — allowed during the soft launch. `joinUrl` is built by the
 *  caller from the request origin. Returns the send status string. */
export async function sendInviteEmail(inviteId: string, joinUrl: string): Promise<"sent" | "skipped" | "failed"> {
  const db = createAdminClient() as DB;
  const { data: invite } = await db.from("trip_invites").select("*").eq("id", inviteId).maybeSingle();
  if (!invite?.invitee_email) return "skipped";

  const [exp, ed, inviter] = await Promise.all([
    invite.experience_id ? db.from("exp_experiences").select("title,currency").eq("id", invite.experience_id).maybeSingle() : Promise.resolve({ data: null }),
    invite.edition_id ? db.from("exp_editions").select("date_start,date_end").eq("id", invite.edition_id).maybeSingle() : Promise.resolve({ data: null }),
    invite.inviter_contact_id ? db.from("contacts").select("name").eq("id", invite.inviter_contact_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const currency = exp.data?.currency || "EUR";
  const inviterName = String(inviter.data?.name ?? "").trim().split(/\s+/)[0] || "A friend";

  const res = await sendEmail({
    to: invite.invitee_email,
    templateKey: "trip_invite",
    vars: {
      firstName: String(invite.invitee_name ?? "").trim().split(/\s+/)[0] || "there",
      inviterName,
      experienceTitle: exp.data?.title || "an NP7 trip",
      dates: fmtRange(ed.data?.date_start ?? null, ed.data?.date_end ?? null),
      rewardFriend: fmtMoney(invite.reward_friend_amount, currency),
      personalNote: invite.note || "",
      joinLink: joinUrl,
    },
    experienceId: invite.experience_id,
    dedupeKey: `trip_invite:${invite.id}`,
  });
  return res.status;
}

/** Admin: grant the two-sided reward — issue an experience-scoped credit voucher
 *  to each side. Idempotent (no-op once granted). Returns an error string or null. */
export async function grantInviteReward(inviteId: string): Promise<string | null> {
  const db = createAdminClient() as DB;
  const { data: invite } = await db.from("trip_invites").select("*").eq("id", inviteId).maybeSingle();
  if (!invite) return "Invite not found.";
  if (invite.reward_status === "granted") return null;
  if (invite.status !== "booked") return "The friend hasn't booked yet.";

  const { data: exp } = invite.experience_id
    ? await db.from("exp_experiences").select("title,currency").eq("id", invite.experience_id).maybeSingle()
    : { data: null };
  const currency = exp?.currency || "EUR";

  async function issueCredit(recipientContactId: string | null, amount: number | null, message: string): Promise<string | null> {
    if (!recipientContactId || !amount) return null;
    let code = generateVoucherCode();
    for (let i = 0; i < 3; i++) {
      const { data: clash } = await db.from("gift_vouchers").select("id").eq("code", code).maybeSingle();
      if (!clash) break;
      code = generateVoucherCode();
    }
    const issuedAt = new Date().toISOString();
    const { data, error } = await db.from("gift_vouchers").insert({
      code,
      recipient_contact_id: recipientContactId,
      experience_id: invite.experience_id,
      amount,
      currency,
      status: "active",
      issued_at: issuedAt,
      redeem_by: redeemByFrom(issuedAt),
      message,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
  }

  try {
    const inviterVoucher = await issueCredit(invite.inviter_contact_id, invite.reward_inviter_amount, "Referral reward — thanks for inviting a friend.");
    const friendVoucher = await issueCredit(invite.invited_contact_id, invite.reward_friend_amount, "Welcome credit — invited by a friend.");
    await db.from("trip_invites").update({
      reward_status: "granted",
      reward_inviter_voucher_id: inviterVoucher,
      reward_friend_voucher_id: friendVoucher,
    }).eq("id", invite.id);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not grant the reward.";
  }
}
