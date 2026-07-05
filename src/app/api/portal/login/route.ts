import { NextRequest, NextResponse } from "next/server";
import { sendMemberMagicLink } from "@/lib/members";

// POST { email } — emails a magic login link if a member account exists.
// Always answers generically (no account enumeration).
export async function POST(request: NextRequest) {
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
  // Only a same-site relative path (guards against open redirects).
  const next = typeof nextRaw === "string" && /^\/(?!\/)/.test(nextRaw) ? nextRaw : undefined;

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  await sendMemberMagicLink({ email, origin, next }).catch(() => ({ sent: false }));

  // Always the same response.
  return NextResponse.json({ ok: true });
}
