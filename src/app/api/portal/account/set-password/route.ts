import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Member sets (or updates) a password for their own account — so next time they
 * can sign in with email + password instead of waiting for a magic link. Uses the
 * SSR client (the member's own session via cookies); `has_password` is flagged in
 * user_metadata so we stop suggesting it. The member sets their OWN password here.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  if (password.length > 128) return NextResponse.json({ error: "That password is too long." }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
