import { supabase } from "@/lib/supabase";
import { availabilityFor } from "@/lib/availability";
import { activeLaunch } from "@/lib/launch-price";
import { resolveTierPct, bestAdvantage, type TierPerkRule } from "@/lib/tier-perks";
import type { TilePlacement } from "@/lib/experience-tile";
import type { ExpCard } from "@/components/experience/upcoming-experiences";

/**
 * The experience tile cards — ONE source for every surface that shows them.
 *
 * The /experience homepage built these inline; the member home then needed the
 * same tiles ("book your next trip") and a hand-rolled second version drifted
 * within a day (plain photos, no branded tile, no spots pill). Extracted so
 * both render literally the same cards from the same queries.
 */

export type Edition = {
  id: string;
  date_start: string | null;
  date_end: string | null;
  max_spots: number | null;
  spots_taken: number | null;
  status: string | null;
  active: boolean | null;
  coaches: string | null;
  launch_discount_pct?: number | null;
  launch_price_until?: string | null;
  public_from?: string | null;
};

export type RawExperience = {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  price: number | null;
  currency: string | null;
  description: string | null;
  hero_image: string | null;
  destination_id: string | null;
  exp_editions: Edition[] | null;
};

export type ExpListItem = RawExperience & { ed: Edition | undefined; spotsLeft: number | null };

function nextEdition(editions: Edition[] | null) {
  const today = new Date().toISOString().slice(0, 10);
  return (editions ?? [])
    // public view only (these cards are cached): early-access weeks stay off
    .filter((e) => e.status === "published" && e.date_start && e.date_start >= today
      && (!e.public_from || e.public_from <= today))
    .sort((a, b) => (a.date_start! < b.date_start! ? -1 : 1))[0];
}

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "Dates coming soon";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const year = (e ?? s).getFullYear();
  return e ? `${day(s)} – ${day(e)} ${year}` : `${day(s)} ${year}`;
}

function money(n: number | null, currency: string | null) {
  if (n == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${n.toLocaleString("en-US")}`;
}

// The lead coach for a tile: the first name in the edition's free-text coaches
// field ("Nico Prien, Simona" -> "Nico Prien"). Empty -> null.
function leadCoach(coaches: string | null | undefined): string | null {
  const first = (coaches ?? "").split(",")[0]?.trim();
  return first || null;
}

export async function getExperienceCards(viewer?: { tierKey: "rider" | "crew" | "legend"; tierLabel: string } | null): Promise<{ cards: ExpCard[]; experiences: ExpListItem[] }> {
  const { data } = await supabase
    .from("exp_experiences")
    .select(
      "id,title,slug,location,price,currency,description,hero_image,destination_id,exp_packages(price,status,edition_id,website_visible),exp_editions(id,date_start,date_end,max_spots,spots_taken,status,active,coaches,launch_discount_pct,launch_price_until,public_from)"
    )
    .eq("status", "published");

  // Active-but-off-website experiences (website_visible=false) stay out of the
  // public listing. Tolerant: pre-migration the column errors → nothing hidden.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visRows } = await (supabase as any).from("exp_experiences").select("id,website_visible").eq("status", "published");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hiddenIds = new Set(((visRows ?? []) as any[]).filter((e) => e.website_visible === false).map((e) => e.id as string));

  /** Lowest price among packages that are active, visible, and either shared or
   *  on the edition being shown. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cheapestPackagePrice = (exp: any): number | null => {
    const edId = exp.ed?.id;
    const prices = ((exp.exp_packages ?? []) as { price: number | null; status: string | null; edition_id: string | null; website_visible: boolean | null }[])
      .filter((p) => p.price != null && p.status === "active" && p.website_visible !== false)
      .filter((p) => !p.edition_id || p.edition_id === edId)
      .map((p) => Number(p.price));
    return prices.length ? Math.min(...prices) : null;
  };

  const withEd = ((data as RawExperience[] | null) ?? []).filter((exp) => !hiddenIds.has(exp.id)).map((exp) => ({ ...exp, ed: nextEdition(exp.exp_editions) }));
  // Per-package availability rolled up to the week: a week is bookable while
  // any one of its packages still has room, so a full hotel no longer hides the
  // no-hotel packages that have no beds to lose.
  const availability = await availabilityFor(withEd.map((x) => x.ed?.id));
  const experiences: ExpListItem[] = withEd
    .map((exp) => ({ ...exp, spotsLeft: exp.ed ? (availability.get(exp.ed.id)?.bestSpotsLeft ?? null) : null }))
    .sort((a, b) => {
      const ad = a.ed?.date_start ?? "9999";
      const bd = b.ed?.date_start ?? "9999";
      return ad < bd ? -1 : 1;
    });

  // Auto-branded tiles: which experiences opted in, and the coach-cutout library.
  // Both tolerant — `tile_auto` (migration 069) and `cutout_url` may not exist yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: autoRows } = await (supabase as any).from("exp_experiences").select("id,tile_auto").eq("status", "published");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoIds = new Set(((autoRows ?? []) as any[]).filter((e) => e.tile_auto === true).map((e) => e.id as string));
  // Per-experience card placement overrides (migration 110). Tolerant: the
  // column may not exist yet → empty map → every tile uses the built-in layout.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: placementRows } = await (supabase as any).from("exp_content").select("experience_id,card_placement");
  const placementByExp = new Map<string, TilePlacement>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((placementRows ?? []) as any[])) if (r.card_placement && typeof r.card_placement === "object") placementByExp.set(r.experience_id, r.card_placement);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: coachRows } = await (supabase as any).from("exp_coaches").select("*");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coachList = (coachRows ?? []) as any[];
  const coachByName = new Map<string, { name: string; cutout: string | null }>();
  for (const c of coachList) {
    coachByName.set(String(c.name ?? "").toLowerCase().trim(), { name: c.name, cutout: c.cutout_url ?? null });
  }
  // Default coach for an auto-tile when the edition names none: the library's head
  // coach (Nico), else the first coach. Keeps every tile branded with a coach.
  const headCoachRow = coachList.find((c) => /head/i.test(String(c.role ?? ""))) ?? coachList[0];
  const headCoach = headCoachRow ? { name: headCoachRow.name as string, cutout: (headCoachRow.cutout_url ?? null) as string | null } : undefined;

  // The TILE shows the week's HEAD COACH — not just anyone on the team. A week's
  // crew is coaches + assistants (exp_edition_coaches); only the one whose role
  // reads "head" fronts the card. Falls back to the library head coach.
  const headCoachByEdition = new Map<string, { name: string; cutout: string | null }>();
  {
    const nextEdIds = experiences.map((e) => e.ed?.id).filter((x): x is string => !!x);
    if (nextEdIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ecRows } = await (supabase as any)
        .from("exp_edition_coaches")
        .select("edition_id,sort_order,name_override,role_override,exp_coaches(name,role,cutout_url)")
        .in("edition_id", nextEdIds).order("sort_order");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of ((ecRows ?? []) as any[])) {
        const role = String(r.role_override ?? r.exp_coaches?.role ?? "");
        if (!/head/i.test(role)) continue;                    // head coach only
        if (headCoachByEdition.has(r.edition_id)) continue;    // first wins (sort_order)
        headCoachByEdition.set(r.edition_id, {
          name: r.name_override ?? r.exp_coaches?.name ?? "",
          cutout: r.exp_coaches?.cutout_url ?? null,
        });
      }
    }
  }

  // Tier-perk rules for the signed-in viewer (one query for all experiences) —
  // the tile whispers the same advantage the picker will charge.
  let perkRules: (TierPerkRule & { experience_id?: string })[] = [];
  if (viewer && (viewer.tierKey === "crew" || viewer.tierKey === "legend")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: perkRows } = await (supabase as any)
      .from("exp_tier_perks").select("experience_id,tier,kind,value,edition_id,package_id").eq("active", true);
    perkRules = (Array.isArray(perkRows) ? perkRows : []);
  }

  // Card data for the month-filtered grid. `months` = every upcoming edition's
  // YYYY-MM, so the month chips reflect exactly what's bookable.
  const today = new Date().toISOString().slice(0, 10);
  const cards: ExpCard[] = experiences.map((exp) => {
    // 1) the week's assigned HEAD COACH → 2) a name typed in the edition's
    // free-text coaches field → 3) the library's head coach.
    const named = leadCoach(exp.ed?.coaches);
    const coach =
      (exp.ed?.id ? headCoachByEdition.get(exp.ed.id) : undefined) ??
      (named ? coachByName.get(named.toLowerCase()) : undefined) ??
      headCoach;
    return {
      id: exp.id,
      slug: exp.slug,
      title: exp.title,
      location: exp.location,
      description: exp.description,
      hero_image: exp.hero_image,
      // no upcoming edition → no price (avoids showing a stale price from a
      // finished trip; the tile reads "Dates coming soon" instead)
      // The cheapest package you can actually buy — not exp_experiences.price,
      // which is a hand-typed legacy column nobody keeps in step with the
      // packages. The detail page already derives it this way, which is how the
      // grid ended up advertising Lake Garda at €1,490 against a €2,390 entry
      // package. Fall back to the stored price only when there are no packages.
      priceLabel: exp.ed ? money(cheapestPackagePrice(exp) ?? exp.price, exp.currency) : null,
      // The raw number behind the label, so the card can strike the old price
      // and show the discounted one when an advantage applies — same
      // Math.round(price · (1 − pct/100)) the checkout charges (lib/tier-perks).
      priceValue: exp.ed ? (cheapestPackagePrice(exp) ?? exp.price) : null,
      dateLabel: fmtRange(exp.ed?.date_start, exp.ed?.date_end),
      spotsLeft: exp.spotsLeft,
      tileAuto: autoIds.has(exp.id),
      coachName: coach?.name ?? named,
      coachCutout: coach?.cutout ?? null,
      placement: placementByExp.get(exp.id) ?? null,
      // The genius-style hint: the launch price is public; a signed-in Crew/
      // Legend sees the combined figure (launch + tier stack additively).
      advantage: (() => {
        if (!exp.ed) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const launch = activeLaunch(exp.ed as any);
        const tierPct = viewer && (viewer.tierKey === "crew" || viewer.tierKey === "legend")
          ? resolveTierPct(perkRules.filter((r) => r.experience_id === exp.id), { tier: viewer.tierKey, editionId: exp.ed.id, packageId: null })
          : 0;
        return bestAdvantage(launch, tierPct, viewer?.tierLabel ?? null);
      })(),
      months: Array.from(
        new Set(
          (exp.exp_editions ?? [])
            .filter((e) => e.status === "published" && e.date_start && e.date_start >= today)
            .map((e) => e.date_start!.slice(0, 7))
        )
      ).sort(),
    };
  });

  return { cards, experiences };
}
