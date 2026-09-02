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

  // Login CSRF: only our own confirm page may submit this form. Without it a
  // third-party page could POST its own token and quietly log a visitor into
  // somebody else's account. Origin is always sent on a form POST; when it is
  // missing we stay lenient rather than lock a real member out.
  const sender = request.headers.get("origin");
  const host = request.headers.get("host") ?? url.host;
  if (sender) {
    let senderHost = "";
    try { senderHost = new URL(sender).host; } catch { senderHost = "x"; }
    if (senderHost !== host) return NextResponse.redirect(`${origin}/account/login`, 303);
  }

  const form = await request.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = String(form?.get("type") ?? "") as EmailOtpType;
  const nextRaw = String(form?.get("next") ?? "/account");
  const next = /^\/(?!\/)/.test(nextRaw) ? nextRaw : "/account";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    // 303: the browser must follow a POST redirect with GET.
    if (!error) return NextResponse.redirect(`${origin}${next}`, 303);
  }

  // An expired ADMIN link belongs back at the admin login, not the member one —
  // `next` tells us which world the link came from. Members keep their
  // destination so a fresh link lands where the old one meant to.
  if (next.startsWith("/admin")) return NextResponse.redirect(`${origin}/admin/login?error=expired`, 303);
  return NextResponse.redirect(
    `${origin}/account/login?error=expired&next=${encodeURIComponent(next)}`,
    303
  );
}
