import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Spends the one-time token from the confirm page's button. POST only, on
 * purpose: a mail scanner that pre-fetches every URL in an incoming message
 * cannot reach this, so the token survives until a person clicks. See the
 * comment on ../page.tsx for the case that forced it.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;

  const form = await request.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = String(form?.get("type") ?? "") as EmailOtpType;
  const nextRaw = String(form?.get("next") ?? "/account");
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : "/account";
  // Where a refusal or a dead token sends them. Admin links belong back at the
  // admin login; a member keeps the destination the link was meant to reach.
  const dead = next.startsWith("/admin")
    ? `${origin}/admin/login?error=expired`
    : `${origin}/account/login?error=expired&next=${encodeURIComponent(next)}`;

  /*
   * Login CSRF: only our own confirm page may submit this form. Without it a
   * third-party page could POST its own token and quietly log a visitor into
   * somebody else's account.
   *
   * Judged on Sec-Fetch-Site first, because it is the header that actually
   * answers the question and every current browser sends it. Origin is the
   * fallback for anything that doesn't, and it is deliberately not trusted to
   * REFUSE on its own: a document's referrer policy can legitimately blank it
   * to `null`, which is not evidence of a cross-site post. Only a real,
   * parseable, foreign host is.
   */
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.redirect(dead, 303);
  if (!site) {
    const sender = request.headers.get("origin");
    const host = request.headers.get("host") ?? url.host;
    if (sender && sender !== "null") {
      let senderHost = "";
      try { senderHost = new URL(sender).host; } catch { senderHost = ""; }
      if (senderHost && senderHost !== host) return NextResponse.redirect(dead, 303);
    }
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    // 303: the browser must follow a POST redirect with GET.
    if (!error) return NextResponse.redirect(`${origin}${next}`, 303);
  }

  return NextResponse.redirect(dead, 303);
}
