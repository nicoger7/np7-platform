/**
 * "First the active ones, and then by date" — Nico's ordering for every
 * experience list.
 *
 * Within a status group: soonest upcoming trip first; then the experiences
 * whose trips are all in the past (most recent first, since that is the one
 * you might still be closing out); then the dateless drafts; alphabet only as
 * the final tiebreak. Shared by the Experiences and Website Content overviews
 * so the two can never disagree about what "by date" means.
 */

export type DatedEdition = { experience_id: string; date_start?: string | null };

export function makeNextTripCompare(editions: DatedEdition[], today = new Date().toISOString().slice(0, 10)) {
  const byExp = new Map<string, { up: string | null; past: string | null }>();
  for (const e of editions) {
    const d = e.date_start ? String(e.date_start).slice(0, 10) : null;
    if (!d) continue;
    const cur = byExp.get(e.experience_id) ?? { up: null, past: null };
    if (d >= today) {
      if (!cur.up || d < cur.up) cur.up = d;
    } else if (!cur.past || d > cur.past) {
      cur.past = d;
    }
    byExp.set(e.experience_id, cur);
  }

  return (a: { id: string; title?: string | null }, b: { id: string; title?: string | null }): number => {
    const A = byExp.get(a.id) ?? { up: null, past: null };
    const B = byExp.get(b.id) ?? { up: null, past: null };
    if (A.up && B.up && A.up !== B.up) return A.up < B.up ? -1 : 1;
    if (A.up !== B.up && (A.up || B.up)) return A.up ? -1 : 1;
    if (A.past && B.past && A.past !== B.past) return A.past > B.past ? -1 : 1;
    if (A.past !== B.past && (A.past || B.past)) return A.past ? -1 : 1;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  };
}
