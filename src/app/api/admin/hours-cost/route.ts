import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Turn logged hours into real edition costs.
 *
 * Hours were being logged and costed nowhere. The only labour in exp_costs came
 * from a one-off run on 2026-06-08 that covered *general* overhead and never
 * touched edition-tagged hours — 44 entries sat un-costed, so every edition's
 * margin was flattering by however long someone actually worked on it.
 *
 * Rules:
 *  - Hours tagged to an edition cost that edition, at the person's own rate.
 *  - The value lands in `actual_amount`. Labour can be estimated up front like
 *    any other cost; the hours people actually logged are what really happened,
 *    so they fill the actual and leave your estimate alone.
 *  - General hours (is_general) are split evenly across editions that hadn't
 *    finished when the work happened — that is what "overhead" means.
 *  - `hours_log.processed_at` is the ledger. A row is costed once; re-running is
 *    safe and does nothing, which is what makes this safe to put on a button.
 *  - Someone with no rate_per_hour is skipped and reported, never costed at 0.
 *
 * GET previews (changes nothing), POST commits.
 */

type Row = {
  id: string; hours: number | null; date: string | null; entry: string | null;
  employee_id: string | null; edition_id: string | null; is_general: boolean | null;
};

async function plan(db: ReturnType<typeof createAdminClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db as any;
  const [{ data: rows }, { data: team }, { data: editions }] = await Promise.all([
    q.from("hours_log").select("id,hours,date,entry,employee_id,edition_id,is_general").is("processed_at", null),
    q.from("team_members").select("id,name,rate_per_hour"),
    q.from("exp_editions").select("id,date_end").is("archived_at", null),
  ]);

  const rate = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const t of (team ?? []) as { id: string; name: string; rate_per_hour: number | null }[]) {
    if (t.rate_per_hour != null) rate.set(t.id, Number(t.rate_per_hour));
    nameOf.set(t.id, t.name);
  }

  const eds = (editions ?? []) as { id: string; date_end: string | null }[];
  const costs: { edition_id: string; item: string; estimated_amount: number; hoursIds: string[] }[] = [];
  const skipped: { name: string; hours: number; why: string }[] = [];
  const bucket = new Map<string, { amount: number; hours: number; ids: string[]; who: string }>();

  for (const r of (rows ?? []) as Row[]) {
    const h = Number(r.hours) || 0;
    const who = nameOf.get(r.employee_id ?? "") ?? "Someone";
    if (!h) continue;
    const rt = r.employee_id ? rate.get(r.employee_id) : undefined;
    if (rt == null) { skipped.push({ name: who, hours: h, why: "no hourly rate set" }); continue; }

    // Which editions does this hour belong to?
    let targets: string[];
    if (r.edition_id) {
      targets = [r.edition_id];
    } else if (r.is_general) {
      // Overhead: spread across the editions that were still live that day.
      const on = r.date ?? "";
      const live = eds.filter((e) => !e.date_end || !on || e.date_end >= on).map((e) => e.id);
      if (!live.length) { skipped.push({ name: who, hours: h, why: "general hours, no live edition to carry them" }); continue; }
      targets = live;
    } else {
      skipped.push({ name: who, hours: h, why: "not tied to an edition and not marked general" });
      continue;
    }

    const share = (h * rt) / targets.length;
    for (const ed of targets) {
      const month = (r.date ?? "").slice(0, 7);
      const key = `${ed}|${who}|${month}|${r.edition_id ? "direct" : "overhead"}`;
      const b = bucket.get(key) ?? { amount: 0, hours: 0, ids: [], who };
      b.amount += share;
      b.hours += h / targets.length;
      b.ids.push(r.id);
      bucket.set(key, b);
    }
  }

  for (const [key, b] of bucket) {
    const [edition_id, who, month, kind] = key.split("|");
    costs.push({
      edition_id,
      item: `${kind === "direct" ? "Labour" : "Overhead labour"} — ${who}${month ? ` (${month})` : ""}`,
      estimated_amount: Math.round(b.amount * 100) / 100,
      hoursIds: b.ids,
    });
  }
  return { costs, skipped };
}

export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { costs, skipped } = await plan(createAdminClient());
  return NextResponse.json({
    lines: costs.length,
    total: Math.round(costs.reduce((s, c) => s + c.estimated_amount, 0) * 100) / 100,
    costs: costs.map(({ hoursIds, ...c }) => ({ ...c, entries: hoursIds.length })),
    skipped,
  });
}

export async function POST(_req: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db as any;
  const { costs, skipped } = await plan(db);

  let written = 0, updated = 0;
  const stamp = new Date().toISOString();
  for (const c of costs) {
    // Logged hours are the ACTUAL. You may have estimated labour up front on the
    // same line; that estimate stays, and the real number fills in beside it.
    // Re-running adds newly logged hours to the actual rather than duplicating
    // the line.
    const { data: existing } = await q.from("exp_costs")
      .select("id, actual_amount").eq("edition_id", c.edition_id).eq("item", c.item).limit(1);
    const prev = existing?.[0];
    const note = `${c.hoursIds.length} hour entr${c.hoursIds.length === 1 ? "y" : "ies"} · updated ${stamp.slice(0, 10)}`;
    const { error } = prev
      ? await q.from("exp_costs").update({
          actual_amount: Math.round(((Number(prev.actual_amount) || 0) + c.estimated_amount) * 100) / 100,
          status: "confirmed",
          notes: note,
        }).eq("id", prev.id)
      : await q.from("exp_costs").insert({
          edition_id: c.edition_id,
          item: c.item,
          // No estimate of our own — you can type one in; the hours own the actual.
          estimated_amount: null,
          actual_amount: c.estimated_amount,
          status: "confirmed",
          date: stamp.slice(0, 10),
          notes: note,
        });
    if (error) continue;
    if (prev) updated++; else written++;
    // Only stamp the hours once their cost row actually landed — a failed
    // insert must stay claimable, not vanish silently.
    await q.from("hours_log").update({ processed_at: stamp }).in("id", c.hoursIds);
  }
  return NextResponse.json({ ok: true, written, updated, skipped });
}
