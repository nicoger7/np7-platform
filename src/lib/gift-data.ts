import { supabase } from "@/lib/supabase";

export type GiftExp = { id: string; title: string; currency: string | null; price: number | null };
export type GiftPkg = { id: string; name: string; price: number | null; experience_id: string };

/** Published experiences + their hero images + a deduped package-tier list, for
 *  the gift voucher buy form. Shared by the public gift page and the in-portal one. */
export async function loadGiftData(): Promise<{ experiences: GiftExp[]; heroes: string[]; packages: GiftPkg[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: exps } = await sb.from("exp_experiences").select("id, title, currency, price, hero_image").eq("status", "published").order("title");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (exps ?? []) as any[];
  const ids = rows.map((e) => e.id);
  const { data: content } = ids.length ? await sb.from("exp_content").select("experience_id, hero_image").in("experience_id", ids) : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExp = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
  const heroes = [...new Set(rows.map((e) => byExp.get(e.id) || e.hero_image).filter(Boolean))] as string[];
  const experiences = rows.map((e) => ({ id: e.id, title: e.title, currency: e.currency, price: e.price ?? null }));

  // Public packages, deduped to one tier per name (lowest "from" price).
  let packages: GiftPkg[] = [];
  if (ids.length) {
    const { data: pkgRows } = await sb.from("exp_packages").select("id, name, price, experience_id, sort_order, status, website_visible").in("experience_id", ids).order("sort_order");
    const tierName = (n: unknown) => String(n || "").replace(/^[A-Za-z]{2,5}\s*\d+\s*[-–—]\s*/, "").trim();
    const byKey = new Map<string, GiftPkg>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of ((pkgRows ?? []) as any[])) {
      if (p.status === "archived" || p.website_visible === false || p.price == null) continue;
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
