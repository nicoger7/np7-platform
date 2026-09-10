import { createAdminClient } from "@/lib/supabase";
import type { FlagRule } from "@/lib/experience-tile";

/**
 * The admin-managed half of the flag set (migration 234).
 *
 * lib/experience-tile.ts holds the nine flags that ship with the app and the
 * keywords they answer to. That list is code, which is why Nico had to ask for
 * a flag rather than add one. This is the same shape, stored, and it is
 * consulted FIRST — so a row both adds a flag and corrects the bundled list.
 *
 * The public tiles resolve their flag on the SERVER (see lib/experience-cards),
 * which is what keeps /experience an ISR page: this query runs once per
 * revalidation, not once per visitor. The little cache below is for the
 * surfaces that are not cached at all — the member portal renders trip tiles on
 * every request and would otherwise read a nine-row table each time.
 */

type Row = { code: string; name: string; src: string | null; keywords: string[] | null };

/** Keywords arrive from the form as a comma/newline separated string, or from
 *  the API as an array. Stored lowercased, trimmed and de-duplicated, which is
 *  the only form the matcher ever wants to see. */
export function cleanKeywords(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? "").split(/[,\n]/);
  return [...new Set(raw.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 40);
}

const TTL_MS = 60_000;
let cache: { at: number; rules: FlagRule[] } | null = null;

function toRules(rows: Row[]): FlagRule[] {
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    src: r.src,
    match: (r.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean),
  }));
}

/**
 * Every live custom flag, as matching rules.
 *
 * Never throws. A flag is decoration on a tile: if the table is unreachable, or
 * the migration has not run on this environment, the bundled set alone is a
 * perfectly good answer and the page renders.
 */
export async function customFlagRules(): Promise<FlagRule[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rules;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("exp_flags")
      .select("code, name, src, keywords")
      .is("archived_at", null)
      .order("sort", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    const rules = toRules((data ?? []) as Row[]);
    cache = { at: Date.now(), rules };
    return rules;
  } catch {
    // Remember the miss too, briefly, so a broken table is not re-queried on
    // every card of every render.
    cache = { at: Date.now(), rules: cache?.rules ?? [] };
    return cache.rules;
  }
}
