import { supabase } from "@/lib/supabase";

export type GiftExp = { id: string; title: string; currency: string | null; price: number | null };
export type GiftPkg = { id: string; name: string; price: number | null; experience_id: string };

/** Published experiences + their hero images + a deduped package-tier list, for
 *  the gift voucher buy form. Shared by the public gift page and the in-portal one. */
export async function loadGiftData(): Promise<{ experiences: GiftExp[]; heroes: string[]; packages: GiftPkg[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: exps } = await sb.from("exp_experiences").select("id, title, currency, price, hero_image").eq("status", "published").order("title");
  // Exclude active-but-off-website experiences from public gifting. Separate query
  // so a not-yet-migrated website_visible column can't break the gift form (errors
  // → empty set → nothing hidden).
  const { data: visRows } = await sb.from("exp_experiences").select("id, website_visible").eq("status", "published");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hiddenIds = new Set(((visRows ?? []) as any[]).filter((e) => e.website_visible === false).map((e) => e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((exps ?? []) as any[]).filter((e) => !hiddenIds.has(e.id));
  const ids = rows.map((e) => e.id);
  const { data: content } = ids.length ? await sb.from("exp_content").select("experience_id, hero_image").in("experience_id", ids) : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExp = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
  const heroes = [...new Set(rows.map((e) => byExp.get(e.id) || e.hero_image).filter(Boolean))] as string[];
  const experiences = rows.map((e) => ({ id: e.id, title: e.title, currency: e.currency, price: e.price ?? null }));

  // Public packages, deduped to one tier per name (lowest "from" price).
  let packages: GiftPkg[] = [];
  if (ids.length) {
    /*
     * The gift shop must offer exactly what the booking flow sells, no more.
     * It used to drop only `archived` rows, so a package parked as `draft`
     * (Bonaire's "Premium Ocean Front", €6,090, never released) was buyable
     * as a gift, and packages that exist only on a past or unpublished week
     * were merged into the generic "any week" list. Same rule as go-live.ts:
     * active, visible, priced, and on a published week that is still ahead
     * (or on no week at all).
     */
    const today = new Date().toISOString().slice(0, 10);
    const { data: edRows } = await sb.from("exp_editions").select("id, status, date_end").in("experience_id", ids);
    const liveEditions = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((edRows ?? []) as any[]).filter((e) => e.status === "published" && (!e.date_end || e.date_end >= today)).map((e) => e.id),
    );
    const { data: pkgRows } = await sb.from("exp_packages").select("id, name, price, experience_id, edition_id, sort_order, status, website_visible, archived_at").in("experience_id", ids).order("sort_order");
    const tierName = (n: unknown) => String(n || "").replace(/^[A-Za-z]{2,5}\s*\d+\s*[-–—]\s*/, "").trim();
    const byKey = new Map<string, GiftPkg>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of ((pkgRows ?? []) as any[])) {
      if (p.archived_at || p.status !== "active" || p.website_visible === false || p.price == null) continue;
      if (p.edition_id && !liveEditions.has(p.edition_id)) continue;
      const name = tierName(p.name) || p.name;
      const key = `${p.experience_id}|${name.toLowerCase()}`;
      const cur = byKey.get(key);
      if (!cur || Number(p.price) < Number(cur.price ?? Infinity)) {
        byKey.set(key, { id: p.id, name, price: p.price, experience_id: p.experience_id });
      }
    }
    packages = [...byKey.values()];
  }
  return { experiences, heroes, packages };
}
