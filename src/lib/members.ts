import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import type { EmailVars } from "@/lib/email/templates";
import { safeOrigin } from "@/lib/public-origin";

/** Look up an auth user id by email (small user base — listUsers is fine). */
async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  const admin = createAdminClient();
  const target = email.toLowerCase();
  // page through (defensive cap)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

function confirmLink(origin: string, tokenHash: string, next = "/account") {
  // This URL carries a live one-time login token, so the host is not up for
  // negotiation. safeOrigin replaces anything that is not ours; see the note
  // there for how a caller-supplied origin used to get here.
  return `${safeOrigin(origin)}/account/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`;
}

/**
 * Ensure a member auth account exists for a contact, link it, and return a
 * one-time activation/login link (on our domain, verified server-side via
 * verifyOtp). Never emails a password.
 */
export async function ensureMemberAccount(opts: {
  contactId: string; email: string; origin: string; next?: string;
}): Promise<{ link: string } | { error: string }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();

  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) {
      userId = await findAuthUserByEmail(email); // race / already exists
      if (!userId) return { error: error.message };
    } else {
      userId = data.user.id;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("contacts").update({ auth_user_id: userId }).eq("id", opts.contactId);

  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (lErr || !tokenHash) return { error: lErr?.message ?? "could not generate link" };

  return { link: confirmLink(opts.origin, tokenHash, opts.next) };
}

/**
 * Invite a team member: ensure an auth account exists for their email, email
 * them a one-time login link that lands in /admin, and return the new/linked
 * auth user id so the caller can link team_members.auth_user_id.
 */
export async function inviteTeamMember(opts: {
  email: string; origin: string; firstName?: string;
}): Promise<{ sent: boolean; userId?: string }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();

  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) {
      userId = await findAuthUserByEmail(email); // race / already exists
      if (!userId) return { sent: false };
    } else {
      userId = data.user.id;
    }
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (error || !tokenHash) return { sent: false, userId };

  await sendEmail({
    to: email,
    templateKey: "account_magic_link",
    vars: { firstName: opts.firstName, activationLink: confirmLink(opts.origin, tokenHash, "/admin") },
    contactId: null,
  });
  return { sent: true, userId };
}

/** Generate a login link for an existing member and (optionally) email it. */
export async function sendMemberMagicLink(opts: {
  email: string; origin: string; firstName?: string; next?: string;
}): Promise<{ sent: boolean }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();
  const userId = await findAuthUserByEmail(email);

  if (!userId) {
    // No account yet — but if this email belongs to a contact WITH a booking
    // (e.g. an admin-created booking whose pro-forma email links the portal),
    // activate the account on the spot: email ownership is proven by receiving
    // the link, so this is exactly as safe as a normal magic-link login.
    // Newsletter-only contacts stay account-less; caller answers generically.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { data: contacts } = await db.from("contacts").select("id").ilike("email", email).is("archived_at", null).limit(3);
    let bookingContact: string | null = null;
    for (const c of (contacts ?? []) as { id: string }[]) {
      const { count } = await db.from("exp_bookings").select("id", { count: "exact", head: true }).eq("contact_id", c.id);
      if (count) { bookingContact = c.id; break; }
    }
    if (!bookingContact) return { sent: false };
    const acct = await ensureMemberAccount({ contactId: bookingContact, email, origin: opts.origin, next: opts.next });
    if ("error" in acct) return { sent: false };
    const vars: EmailVars = { firstName: opts.firstName, activationLink: acct.link };
    await sendEmail({ to: email, templateKey: "account_magic_link", vars, contactId: bookingContact });
    return { sent: true };
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (error || !tokenHash) return { sent: false };

  const vars: EmailVars = { firstName: opts.firstName, activationLink: confirmLink(opts.origin, tokenHash, opts.next) };
  await sendEmail({ to: email, templateKey: "account_magic_link", vars, contactId: null });
  return { sent: true };
}
