import { NextResponse } from "next/server";
import { VIEW_AS_COOKIE } from "@/lib/auth";

/**
 * Clear the admin member-preview cookies. Deliberately requires NO auth: it only
 * ever removes an impersonation, never grants one, and it has to work on the way
 * out of a session — which is exactly when the caller may no longer be
 * authenticated. Leaving the cookie behind was what made a later login resolve
 * as the previously previewed customer.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set("np7_preview", "", { path: "/", maxAge: 0 });
  return res;
}
