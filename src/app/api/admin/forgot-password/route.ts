import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

/**
 * "Forgot password?" on the admin login.
 *
 * Same machinery as the member magic link (lib/members.ts): a server-generated
 * recovery token, wrapped in OUR confirm route on OUR domain, sent through
 * Resend with the branded template — no dependency on Supabase's mailer or
 * its redirect allowlist. The confirm route verifies the token server-side,
 * the session lands in cookies, and /admin/reset-password lets them set a
 * new password.
 *
 * Always answers { ok: true }: whether an email has an account is nobody's
 * business but ours (no account enumeration). A stranger's address simply
 * receives nothing.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = linkData?.properties?.hashed_token;
  // Unknown account → same answer, no mail. Never say which it was.
  if (error || !tokenHash) return NextResponse.json({ ok: true });

  const { origin } = new URL(request.url);
  const resetLink = `${origin}/account/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent("/admin/reset-password")}`;

  await sendEmail({
    to: email,
    templateKey: "password_reset",
    vars: { resetLink },
    contactId: null,
    // One log row per request — resend must work, so never a stable key.
    dedupeKey: `password_reset:${email}:${Date.now()}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
