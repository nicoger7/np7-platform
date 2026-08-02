import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * The duplicate-contact review queue, and the merge that resolves it.
 *
 * Matching is by NAME, not email — measured before building: across 14,723
 * contacts there are exactly 2 duplicate-email groups, while Pim Heurman alone
 * has 5 rows carrying 4 different addresses and a null. People re-book with a
 * new email; they rarely re-book with a new name. The maillist import's 9k
 * rows named after their own email prefix ("info", "nico.prien") are excluded,
 * or the queue would be 90% artifacts.
 *
 * Nothing merges automatically. Same name ≠ same person, so every merge is a
 * human decision made here — the API only lines the candidates up and defaults
 * the survivor to what "account records always have priority" means: the row
 * with auth_user_id, else the one with bookings, else the oldest.
 */

export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: contacts, error } = await db
    .from("contacts")
    .select("id,name,email,email2,phone,country,auth_user_id,created_at,source,tags")
    .is("archived_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string; name: string | null; email: string | null; email2: string | null;
    phone: string | null; country: string | null; auth_user_id: string | null;
    created_at: string; source: string | null; tags: string[] | null;
  };
  const rows = (contacts ?? []) as Row[];

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  // A name that is just the email's local part is an import artifact, not a
  // person's name — it can't identify anyone.
  const artifact = (r: Row) => {
    const n = norm(r.name);
    if (!n || !n.includes(" ")) return true;
    const prefix = norm((r.email ?? "").split("@")[0] ?? "");
    return n === prefix;
  };

  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    if (artifact(r)) continue;
    const k = norm(r.name);
    const arr = byName.get(k) ?? [];
    arr.push(r);
    byName.set(k, arr);
  }
  const nameGroups = [...byName.values()].filter((g) => g.length > 1);

  // The two same-email groups are real too — catch them even when the names
  // differ (typo'd name, married name).
  const byEmail = new Map<string, Row[]>();
  for (const r of rows) {
    const e = norm(r.email);
    if (!e) continue;
    const arr = byEmail.get(e) ?? [];
    arr.push(r);
    byEmail.set(e, arr);
  }
  const inNameGroup = new Set(nameGroups.flat().map((r) => r.id));
  const emailGroups = [...byEmail.values()].filter(
    (g) => g.length > 1 && !g.every((r) => inNameGroup.has(r.id)),
  );

  const groups = [...nameGroups, ...emailGroups];
  const ids = [...new Set(groups.flat().map((r) => r.id))];

  // Weight: a row's bookings tell you which record the history lives on.
  const bookingCount = new Map<string, number>();
  if (ids.length) {
    const { data: bks } = await db.from("exp_bookings").select("contact_id").in("contact_id", ids);
    for (const b of (bks ?? []) as { contact_id: string | null }[]) {
      if (b.contact_id) bookingCount.set(b.contact_id, (bookingCount.get(b.contact_id) ?? 0) + 1);
    }
  }

  const out = groups
    .map((g) => {
      const members = g
        .map((r) => ({
          id: r.id, name: r.name, email: r.email, email2: r.email2, phone: r.phone,
          country: r.country, createdAt: r.created_at, source: r.source,
          hasAccount: !!r.auth_user_id,
          bookings: bookingCount.get(r.id) ?? 0,
          maillist: (r.tags ?? []).includes("maillist"),
        }))
        .sort((a, b) => Number(b.hasAccount) - Number(a.hasAccount) || b.bookings - a.bookings || a.createdAt.localeCompare(b.createdAt));
      return {
        key: norm(g[0].name) || norm(g[0].email),
        members,
        // "account records always have priority" — the default survivor.
        suggestedSurvivor: members[0].id,
      };
    })
    // The ones with real history first — that's where a wrong merge would hurt.
    .sort((a, b) =>
      b.members.reduce((s, m) => s + m.bookings + (m.hasAccount ? 2 : 0), 0)
      - a.members.reduce((s, m) => s + m.bookings + (m.hasAccount ? 2 : 0), 0));

  return NextResponse.json({ groups: out, total: out.length });
}

/** Merge one contact into another. Every FK moves, no address is lost. */
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const survivorId = String(body?.survivorId ?? "");
  const mergedId = String(body?.mergedId ?? "");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(survivorId) || !UUID.test(mergedId)) {
    return NextResponse.json({ error: "Pick a survivor and a duplicate." }, { status: 400 });
  }
  if (survivorId === mergedId) {
    return NextResponse.json({ error: "That's the same contact twice." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Refuse to merge AWAY an account: the auth_user_id row is the identity a
  // member signs in with. If both have accounts, that's not a merge — it's a
  // support case.
  const { data: merged } = await db.from("contacts").select("auth_user_id").eq("id", mergedId).maybeSingle();
  if (merged?.auth_user_id) {
    const { data: surv } = await db.from("contacts").select("auth_user_id").eq("id", survivorId).maybeSingle();
    if (!surv?.auth_user_id) {
      return NextResponse.json({ error: "The duplicate has the member account — merge the other way around, the account row survives." }, { status: 400 });
    }
    return NextResponse.json({ error: "Both rows have member accounts. Merging would lock one login out — this needs a hand, not a button." }, { status: 400 });
  }

  const { data, error } = await db.rpc("merge_contacts", { p_survivor: survivorId, p_merged: mergedId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
