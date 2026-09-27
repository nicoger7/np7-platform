import { supabase } from "@/lib/supabase";
import { buildGiftCatalog, type GiftEditionRow, type GiftExpRow, type GiftHotelRow, type GiftPackageRow, type GiftTrip } from "@/lib/gift-catalog";

// The shaping rules live in gift-catalog.ts (pure, shared with the chooser).
// Re-exported so server code and tests keep one import path.
export * from "@/lib/gift-catalog";

/** The giftable trips with their weeks, levels and packages, plus the hero
 *  images for the photo band. Shared by the public gift page and the
 *  in-portal one. */
export async function loadGiftData(): Promise<{ trips: GiftTrip[]; heroes: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: exps } = await sb.from("exp_experiences").select("id, title, currency, hero_image, page_template").eq("status", "published").order("title");
  // Exclude active-but-off-website experiences from public gifting. Separate query
  // so a not-yet-migrated website_visible column can't break the gift form (errors
  // → empty set → nothing hidden).
  const { data: visRows } = await sb.from("exp_experiences").select("id, website_visible").eq("status", "published");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hiddenIds = new Set(((visRows ?? []) as any[]).filter((e) => e.website_visible === false).map((e) => e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((exps ?? []) as any[]).filter((e) => !hiddenIds.has(e.id));
  const ids = rows.map((e) => e.id);

  const [{ data: edRows }, { data: pkgRows }] = ids.length
    ? await Promise.all([
        sb.from("exp_editions").select("id, experience_id, label, status, kind, date_start, date_end, archived_at").in("experience_id", ids),
        sb.from("exp_packages").select("id, name, price, category, hotel_id, experience_id, edition_id, sort_order, status, website_visible, archived_at").in("experience_id", ids).order("sort_order"),
      ])
    : [{ data: [] }, { data: [] }];

  // Hotel names for the cards' short line. Only the hotels a package links,
  // and tolerant: no hotels answer just means no hotel line.
  const hotelIds = [...new Set(((pkgRows ?? []) as GiftPackageRow[]).map((p) => p.hotel_id).filter(Boolean))] as string[];
  const { data: hotelRows } = hotelIds.length
    ? await sb.from("hotels").select("id, name").in("id", hotelIds)
    : { data: [] };

  const today = new Date().toISOString().slice(0, 10);
  const { trips } = buildGiftCatalog({
    experiences: rows as GiftExpRow[],
    editions: (edRows ?? []) as GiftEditionRow[],
    packages: (pkgRows ?? []) as GiftPackageRow[],
    hotels: (hotelRows ?? []) as GiftHotelRow[],
    today,
  });

  // Photo band: the heroes of the trips the chooser actually offers, so a
  // clinic that cannot be gifted does not headline the page.
  const shown = new Set(trips.map((t) => t.id));
  const heroIds = ids.filter((id) => shown.has(id));
  const { data: content } = heroIds.length ? await sb.from("exp_content").select("experience_id, hero_image").in("experience_id", heroIds) : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExp = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
  const heroes = [...new Set(rows.filter((e) => shown.has(e.id)).map((e) => byExp.get(e.id) || e.hero_image).filter(Boolean))] as string[];

  return { trips, heroes };
}
