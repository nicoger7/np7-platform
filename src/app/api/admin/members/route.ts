import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { ensureMemberAccount } from "@/lib/members";
import { sendEmail } from "@/lib/email/send";

// (Auth enforced by middleware: /api/admin/* requires an active team member.)

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [{ data: contacts }, { data: bookings }, usersRes] = await Promise.all([
    admin.from("contacts").select("id,name,email,auth_user_id,created_at,marketing_opt_in").order("name"),
    admin.from("exp_bookings").select("contact_id"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const counts: Record<string, number> = {};
  (bookings ?? []).forEach((b: { contact_id: string | null }) => {
    if (b.contact_id) counts[b.contact_id] = (counts[b.contact_id] ?? 0) + 1;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userById = new Map<string, any>((usersRes?.data?.users ?? []).map((u: any) => [u.id, u]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (contacts ?? []).map((c: any) => {
    const u = c.auth_user_id ? userById.get(c.auth_user_id) : null;
    return {
      id: c.id, name: c.name, email: c.email, bookings: counts[c.id] ?? 0,
      hasAccount: !!c.auth_user_id, marketing: !!c.marketing_opt_in,
      lastSignIn: u?.last_sign_in_at ?? null,
      banned: !!(u?.banned_until && new Date(u.banned_until) > new Date()),
    };
  });

  return NextResponse.json({
    members: rows.filter((r: { hasAccount: boolean }) => r.hasAccount),
    guests: rows.filter((r: { hasAccount: boolean; bookings: number }) => !r.hasAccount && r.bookings > 0),
  });
}

export async function POST(request: NextRequest) {
  const { action, contactId } = await request.json().catch(() => ({}));
  if (!contactId) return NextResponse.json({ error: "Missing contact" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: contact } = await admin.from("contacts").select("id,name,email,auth_user_id").eq("id", contactId).maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;

  if (action === "invite") {
    if (!contact.email) return NextResponse.json({ error: "Contact has no email" }, { status: 400 });
    const acct = await ensureMemberAccount({ contactId: contact.id, email: contact.email, origin });
    if ("error" in acct) return NextResponse.json({ error: acct.error }, { status: 400 });
    await sendEmail({
      to: contact.email, templateKey: "account_magic_link",
      vars: { firstName: (contact.name ?? "").split(" ")[0] || undefined, activationLink: acct.link },
      contactId: contact.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "deactivate" || action === "reactivate") {
    if (!contact.auth_user_id) return NextResponse.json({ error: "No account" }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(contact.auth_user_id, {
      ban_duration: action === "deactivate" ? "876000h" : "none",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
