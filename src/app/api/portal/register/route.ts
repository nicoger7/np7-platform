import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { ensureMemberAccount } from "@/lib/members";
import { sendEmail } from "@/lib/email/send";

/**
 * Self-service registration (magic-link signup). Finds or creates a contact,
 * provisions a member auth account, and emails a one-time link to finish — no
 * password at signup (they can set one later on their profile).
 *
 * Always answers generically (never reveals whether an account already existed).
 */
export async function POST(request: NextRequest) {
  let email = "", name = "", nextRaw: unknown = "";
  try {
    ({ email, name, next: nextRaw } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  email = (email ?? "").trim().toLowerCase();
  name = (name ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  const next = typeof nextRaw === "string" && /^\/(?!\/)/.test(nextRaw) ? nextRaw : undefined;

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    // find or create the contact
    const { data: existing } = await db.from("contacts").select("id, name").eq("email", email).maybeSingle();
    let contactId = existing?.id as string | undefined;
    if (!contactId) {
      const { data: created } = await db
        .from("contacts").insert({ name: name || email.split("@")[0], email, source: "website-register" }).select("id").single();
      contactId = created?.id;
    } else if (name && !existing?.name) {
      await db.from("contacts").update({ name }).eq("id", contactId);
    }
    if (!contactId) return NextResponse.json({ ok: true }); // generic

    const res = await ensureMemberAccount({ contactId, email, origin, next });
    if ("link" in res) {
      const firstName = (name || existing?.name || "").split(" ")[0] || undefined;
      await sendEmail({
        to: email,
        templateKey: "account_magic_link",
        vars: { firstName, activationLink: res.link },
        contactId,
        dedupeKey: `register:${contactId}:${Date.now()}`,
      }).catch(() => {});
    }
  } catch {
    // swallow — still answer generically
  }

  return NextResponse.json({ ok: true });
}
