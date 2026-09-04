import { NextRequest, NextResponse } from "next/server";
import { sendMemberMagicLink } from "@/lib/members";
import { publicOrigin } from "@/lib/public-origin";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
// POST { email } — emails a magic login link if a member account exists.
// Always answers generically (no account enumeration).
export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "portal-login", policy: LIMITS.mailToAnyAddress });
  if (tooMany) return tooMany;

  let email = "", nextRaw: unknown = "";
  try {
    const b = await request.json();
    email = b.email; nextRaw = b.next;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  email = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  // Second counter, keyed on the person being mailed rather than the caller:
  // an attacker rotating IP addresses would otherwise get a fresh allowance per
  // address for the same victim's inbox. Answers ok either way, so this cannot
  // be used to tell whether an account exists.
  const tooManyForThem = await rateLimited(request, {
    name: "portal-login", policy: LIMITS.mailToAnyAddress, subject: email,
  });
  if (tooManyForThem) return NextResponse.json({ ok: true });

  // Only a same-site relative path (guards against open redirects).
  const next = typeof nextRaw === "string" && /^\/(?!\/)/.test(nextRaw) ? nextRaw : undefined;

  const origin = publicOrigin();
  await sendMemberMagicLink({ email, origin, next }).catch(() => ({ sent: false }));

  // Always the same response.
  return NextResponse.json({ ok: true });
}
