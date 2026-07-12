import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { ensureMemberAccount } from "@/lib/members";
import { sendEmail } from "@/lib/email/send";
import { isAttending } from "@/lib/types";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";

// (Auth enforced by middleware: /api/admin/* requires an active team member.)

// Supabase REST caps every read at 1000 rows — since the 13.5k newsletter
// import, "select all contacts" silently returns only the first 1000 by name.
// So: page through big tables, and only fetch the contacts this page is
// actually about (has an account, or has a booking) instead of the whole CRM.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function allRows(build: (q: { from: number; to: number }) => any): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build({ from, to: from + 999 });
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const chunk = <T,>(arr: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const SELECT = "id,name,email,auth_user_id,created_at,marketing_opt_in";
  const [bookings, crmContacts, usersRes] = await Promise.all([
    allRows(({ from, to }) => admin.from("exp_bookings").select("contact_id, status, experience_id, exp_experiences(id,title)").range(from, to)),
    // Every CRM contact (same rule as the Contacts page's CRM view: newsletter-only
    // `maillist` imports stay out) — this page is where portal invites are sent from,
    // so the whole working CRM belongs here, bookings or not.
    allRows(({ from, to }) => admin.from("contacts").select(SELECT).is("archived_at", null).or("tags.is.null,tags.not.cs.{maillist}").range(from, to)),
    // fine while accounts < 1000; page like the above when we get there
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  // Newsletter-only contacts still surface here if they have an account or a
  // real booking — those are members/guests no matter which list they came from.
  const haveIds = new Set(crmContacts.map((c: { id: string }) => c.id));
  const extraIds = [...new Set(bookings.map((b: { contact_id: string | null }) => b.contact_id).filter((id: string | null): id is string => !!id && !haveIds.has(id)))];
  const extraContacts = (await Promise.all(
    chunk(extraIds, 200).map((ids) =>
      admin.from("contacts").select(SELECT).is("archived_at", null).in("id", ids)
        .then(({ data }: { data: unknown[] | null }) => data ?? [])
    )
  )).flat();
  const extraAccounts = await allRows(({ from, to }) =>
    admin.from("contacts").select(SELECT).is("archived_at", null).not("auth_user_id", "is", null).contains("tags", ["maillist"]).range(from, to));
  const seen = new Set<string>();
  const contacts = [...crmContacts, ...extraContacts, ...extraAccounts]
    .filter((c: { id: string }) => !seen.has(c.id) && (seen.add(c.id), true))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  // Per-contact booking count + the distinct experiences they're booked on
  // (with whether they've SECURED a spot — that's a real participant).
  const counts: Record<string, number> = {};
  const expsByContact: Record<string, Map<string, { id: string; title: string; secured: boolean }>> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (bookings ?? []).forEach((b: any) => {
    const cid = b.contact_id;
    if (!cid) return;
    counts[cid] = (counts[cid] ?? 0) + 1;
    const exp = b.exp_experiences;
    if (exp?.id) {
      const m = (expsByContact[cid] ||= new Map());
      const secured = isAttending(b.status);
      const prev = m.get(exp.id);
      m.set(exp.id, { id: exp.id, title: exp.title, secured: secured || !!prev?.secured });
    }
  });

  // Level fields (migration 036) — tolerant: missing columns → just omit.
  // Scoped to this page's contacts (the whole-table select hits the 1000 cap).
  const levelById: Record<string, { level: string | null; status: string | null; self: string | null }> = {};
  try {
    const lv = (await Promise.all(
      chunk(contacts.map((c: { id: string }) => c.id), 200).map((ids) =>
        admin.from("contacts").select("id, level, level_status, self_level").in("id", ids)
          .then(({ data, error }: { data: unknown[] | null; error: unknown }) => (error ? [] : data ?? []))
      )
    )).flat();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lv.forEach((c: any) => { levelById[c.id] = { level: c.level ?? null, status: c.level_status ?? null, self: c.self_level ?? null }; });
  } catch { /* pre-migration */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userById = new Map<string, any>((usersRes?.data?.users ?? []).map((u: any) => [u.id, u]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (contacts ?? []).map((c: any) => {
    const u = c.auth_user_id ? userById.get(c.auth_user_id) : null;
    const exps = expsByContact[c.id] ? [...expsByContact[c.id].values()] : [];
    const lvl = levelById[c.id];
    return {
      id: c.id, name: c.name, email: c.email, bookings: counts[c.id] ?? 0,
      hasAccount: !!c.auth_user_id, marketing: !!c.marketing_opt_in,
      lastSignIn: u?.last_sign_in_at ?? null,
      banned: !!(u?.banned_until && new Date(u.banned_until) > new Date()),
      experiences: exps,
      participant: exps.some((e) => e.secured),
      level: lvl?.level ?? null,
      levelStatus: lvl?.status ?? null,
      selfLevel: lvl?.self ?? null,
    };
  });

  // Distinct experiences for the filter dropdown.
  const expFilter = new Map<string, string>();
  for (const r of rows) for (const e of r.experiences) expFilter.set(e.id, e.title);

  // Field redaction: roles without "contact_pii" don't get emails.
  const access = await getRequestAccess();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = access && !effectiveCanSeeField(access, "contact_pii") ? rows.map((r: any) => ({ ...r, email: null, pii_redacted: true })) : rows;

  return NextResponse.json({
    members: out.filter((r: { hasAccount: boolean }) => r.hasAccount),
    // every CRM contact without an account — each row carries "Invite to portal"
    guests: out.filter((r: { hasAccount: boolean }) => !r.hasAccount),
    experiences: [...expFilter.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
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
