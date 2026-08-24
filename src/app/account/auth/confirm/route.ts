import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Server-side magic-link verification (SSR cookie session). The activation /
// login emails point here with a token_hash.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/account";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  // An expired ADMIN link (password reset) belongs back at the admin login,
  // not the member one — `next` tells us which world the link came from.
  if (next.startsWith("/admin")) return NextResponse.redirect(`${origin}/admin/login?error=expired`);
  return NextResponse.redirect(`${origin}/account/login?error=expired`);
}
