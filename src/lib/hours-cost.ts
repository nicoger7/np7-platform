import { createAdminClient } from "@/lib/supabase";

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
 *  - Hours on an EXPERIENCE (no edition) split across that experience's weeks
 *    that were still upcoming on the day the work happened.
 *  - Hours on nothing are overhead: an equal share per experience that was live
 *    or still ahead, then spread within each across its own upcoming weeks.
 *    Equal per experience, not per edition — three Bonaire weeks must not pull
 *    three times the overhead of one Alacati week.
 *  - `hours_log.processed_at` is the ledger. A row is costed once; re-running is
 *    safe and does nothing, which is what makes this safe to put on a button.
 *  - Someone with no rate_per_hour is skipped and reported, never costed at 0.
 *
 * GET previews (changes nothing), POST commits.
 */

type Row = {
  id: string; hours: number | null; date: string | null; entry: string | null;
  employee_id: string | null; edition_id: string | null; experience_id: string | null; is_general: boolean | null;
};

export async function planHoursCosts(db: ReturnType<typeof createAdminClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db as any;
  const [{ data: rows }, { data: team }, { data: editions }] = await Promise.all([
    q.from("hours_log").select("id,hours,date,entry,employee_id,edition_id,experience_id,is_general").is("processed_at", null),
    q.from("team_members").select("id,name,rate_per_hour"),
    q.from("exp_editions").select("id,experience_id,date_end").is("archived_at", null),
  ]);

  const rate = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const t of (team ?? []) as { id: string; name: string; rate_per_hour: number | null }[]) {
    if (t.rate_per_hour != null) rate.set(t.id, Number(t.rate_per_hour));
    nameOf.set(t.id, t.name);
  }

  const eds = (editions ?? []) as { id: string; experience_id: string | null; date_end: string | null }[];
  /** Editions that hadn't finished yet on the day the work happened — "upcoming
   *  at that moment". An hour worked in March belongs to the weeks that were
   *  still ahead in March, not to one that had already run. */
  const upcomingOn = (on: string) => eds.filter((e) => !e.date_end || !on || e.date_end >= on);

  const expOf = new Map<string, string>();
  for (const e of eds) if (e.experience_id) expOf.set(e.id, e.experience_id);

  const costs: { edition_id: string; experience_id: string; item: string; estimated_amount: number; hoursIds: string[] }[] = [];
  const skipped: { name: string; hours: number; why: string }[] = [];
  const bucket = new Map<string, { amount: number; ids: string[]; who: string }>();

  for (const r of (rows ?? []) as Row[]) {
    const h = Number(r.hours) || 0;
    const who = nameOf.get(r.employee_id ?? "") ?? "Someone";
    if (!h) continue;
    const rt = r.employee_id ? rate.get(r.employee_id) : undefined;
    if (rt == null) { skipped.push({ name: who, hours: h, why: "no hourly rate set" }); continue; }

    const total = h * rt;
    const on = r.date ?? "";
    // What each edition gets from this one hour entry.
    const share = new Map<string, number>();

    if (r.edition_id) {
      // 1. Booked to a week → that week carries it.
      share.set(r.edition_id, total);
    } else if (r.experience_id) {
      // 2. Booked to an experience → split across that experience's upcoming
      //    weeks. Work on "Bonaire" benefits whichever Bonaire weeks are still
      //    ahead, not the one that already ran.
      const mine = upcomingOn(on).filter((e) => e.experience_id === r.experience_id);
      if (!mine.length) { skipped.push({ name: who, hours: h, why: "experience has no upcoming edition" }); continue; }
      for (const e of mine) share.set(e.id, total / mine.length);
    } else {
      // 3. General → equal per EXPERIENCE that is live or still ahead, then
      //    spread within each experience across its own upcoming weeks. Equal
      //    per experience, not per edition: three Bonaire weeks shouldn't pull
      //    three times the overhead of one Alacati week.
      const live = upcomingOn(on).filter((e) => e.experience_id);
      const byExp = new Map<string, string[]>();
      for (const e of live) {
        const list = byExp.get(e.experience_id!) ?? [];
        list.push(e.id);
        byExp.set(e.experience_id!, list);
      }
      if (!byExp.size) { skipped.push({ name: who, hours: h, why: "no active experience to carry general hours" }); continue; }
      const perExperience = total / byExp.size;
      for (const list of byExp.values()) {
        for (const id of list) share.set(id, (share.get(id) ?? 0) + perExperience / list.length);
      }
    }

    const kind = r.edition_id ? "direct" : r.experience_id ? "experience" : "overhead";
    const month = on.slice(0, 7);
    for (const [ed, amount] of share) {
      const key = `${ed}|${who}|${month}|${kind}`;
      const b = bucket.get(key) ?? { amount: 0, ids: [], who };
      b.amount += amount;
      b.ids.push(r.id);
      bucket.set(key, b);
    }
  }

  const LABEL: Record<string, string> = { direct: "Labour", experience: "Labour (experience)", overhead: "Overhead labour" };
  for (const [key, b] of bucket) {
    const [edition_id, who, month, kind] = key.split("|");
    const experience_id = expOf.get(edition_id);
    if (!experience_id) continue; // an edition without an experience can't carry a cost row
    costs.push({
      edition_id,
      experience_id,
      item: `${LABEL[kind]} — ${who}${month ? ` (${month})` : ""}`,
      estimated_amount: Math.round(b.amount * 100) / 100,
      hoursIds: b.ids,
    });
  }
  return { costs, skipped };
}

/** Write the plan. Safe to call repeatedly — processed_at is the ledger. */
export async function commitHoursCosts(db: ReturnType<typeof createAdminClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db as any;
  const { costs, skipped } = await planHoursCosts(db);
  let written = 0, updated = 0;
  const failures: string[] = [];
  const stamp = new Date().toISOString();
  for (const c of costs) {
    // Logged hours are the ACTUAL. An estimate you typed on the same line stays;
    // the real number fills in beside it. Re-running tops up rather than
    // duplicating.
    const { data: existing } = await q.from("exp_costs")
      .select("id, actual_amount").eq("edition_id", c.edition_id).eq("item", c.item).limit(1);
    const prev = existing?.[0];
    const note = `${c.hoursIds.length} hour entr${c.hoursIds.length === 1 ? "y" : "ies"} · updated ${stamp.slice(0, 10)}`;
    const { error } = prev
      ? await q.from("exp_costs").update({
          actual_amount: Math.round(((Number(prev.actual_amount) || 0) + c.estimated_amount) * 100) / 100,
          status: "confirmed", notes: note,
        }).eq("id", prev.id)
      : await q.from("exp_costs").insert({
          // experience_id is NOT NULL on exp_costs — omitting it made every
          // nightly insert fail, silently, for weeks. The edition knows its
          // experience; the row carries both.
          experience_id: c.experience_id,
          edition_id: c.edition_id, item: c.item,
          estimated_amount: null, actual_amount: c.estimated_amount,
          status: "confirmed", date: stamp.slice(0, 10), notes: note,
        });
    if (error) { failures.push(`${c.item}: ${error.message}`); continue; }
    if (prev) updated++; else written++;
    // Only stamp the hours once their row landed — a failed write must stay
    // claimable rather than vanish.
    await q.from("hours_log").update({ processed_at: stamp }).in("id", c.hoursIds);
  }
  return { written, updated, skipped, failures };
}
