import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import type { EmailVars } from "@/lib/email/templates";

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
  return `${origin}/account/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`;
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

/** Generate a login link for an existing member and (optionally) email it. */
export async function sendMemberMagicLink(opts: {
  email: string; origin: string; firstName?: string; next?: string;
}): Promise<{ sent: boolean }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();
  const userId = await findAuthUserByEmail(email);
  if (!userId) return { sent: false }; // no account — caller still answers generically

  const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (error || !tokenHash) return { sent: false };

  const vars: EmailVars = { firstName: opts.firstName, activationLink: confirmLink(opts.origin, tokenHash, opts.next) };
  await sendEmail({ to: email, templateKey: "account_magic_link", vars, contactId: null });
  return { sent: true };
}
