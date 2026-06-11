import { NextRequest, NextResponse } from "next/server";
import { sendMemberMagicLink } from "@/lib/members";

// POST { email } — emails a magic login link if a member account exists.
// Always answers generically (no account enumeration).
export async function POST(request: NextRequest) {
  let email = "";
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  email = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  await sendMemberMagicLink({ email, origin }).catch(() => ({ sent: false }));

  // Always the same response.
  return NextResponse.json({ ok: true });
}
