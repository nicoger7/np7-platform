import { supabase } from "@/lib/supabase";

/*
 * No `price` on the experience any more (Nico, 27 Sep 2026). The gift page
 * used to ship exp_experiences.price to the browser, so the page source still
 * carried Lake Garda €1,490 and Tenerife €3,120 after that column stopped
 * deciding any money. A number that is not shown and not used should not be
 * sent either: anyone reading the source took it as a price.
 */
export type GiftExp = { id: string; title: string; currency: string | null };

/**
 * One package a buyer can match the voucher to. Every package is sold on ONE
 * week, so it carries that week: the form used to merge packages from every
 * week under one name and say "they pick the week when they book", which was
 * not true for any of them. `week` is null only for a package with no week at
 * all, which the booking flow sells on every week.
 */
export type GiftPkg = {
  id: string;
  name: string;
  price: number | null;
  experience_id: string;
  week: string | null;
  week_start: string | null;
};

// Row shapes as they come out of the database. Loose on purpose: a missing
// column reads as undefined and every rule below treats that as "not set".
export type GiftExpRow = { id: string; title: string; currency?: string | null; page_template?: string | null };
export type GiftEditionRow = {
  id: string;
  experience_id: string;
  status?: string | null;
  kind?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  archived_at?: string | null;
};
export type GiftPackageRow = {
  id: string;
  name: string | null;
  price: number | string | null;
  experience_id: string;
  edition_id?: string | null;
  status?: string | null;
  website_visible?: boolean | null;
  archived_at?: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "30 Nov - 6 Dec 2026", "7 - 13 Dec 2026", "28 Dec 2026 - 3 Jan 2027".
 * Read straight from the yyyy-mm-dd string, never through a Date in the
 * server's time zone, so a week cannot slide by a day between Vercel (UTC) and
 * a laptop. A plain hyphen, never a long dash: this is guest-facing.
 */
export function giftWeekLabel(start?: string | null, end?: string | null): string | null {
  const parse = (s?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
  };
  const a = parse(start);
  const b = parse(end);
  if (!a) return null;
  if (!b) return `${a.d} ${MONTHS[a.m]} ${a.y}`;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m]} ${a.y} - ${b.d} ${MONTHS[b.m]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m]} - ${b.d} ${MONTHS[b.m]} ${b.y}`;
  if (a.d === b.d) return `${a.d} ${MONTHS[a.m]} ${a.y}`;
  return `${a.d} - ${b.d} ${MONTHS[b.m]} ${b.y}`;
}

/**
 * The name a guest reads on a package button. Drops a leading week code
 * ("BON1 - ") because the button now says the week in words, and turns the
 * long dashes some package names carry ("Advanced – Standard Room",
 * "OBX Clinic — Ticket") into a middot, the way the rest of the guest copy
 * reads.
 */
export function giftPackageName(raw: unknown): string {
  const full = String(raw || "").trim();
  const tier = full.replace(/^[A-Za-z]{2,5}\s*\d+\s*[-–—]\s*/, "").trim() || full;
  return tier.replace(/\s*[–—]\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
}

/**
 * What the gift form may offer, worked out from plain rows so it can be tested
 * without a database (Nico, 27 Sep 2026).
 *
 * Experiences: everything the caller passes (published and on the website),
 * minus the clinics. A clinic is booked through a card checkout that charges
 * the whole ticket at once, and that checkout has no voucher field, so a clinic
 * voucher could never be used: the recipient would pay in full and hold a code
 * with nothing left to cover. An experience counts as a clinic when its page is
 * the event template, or when it has live weeks and every one of them is an
 * event. An experience with no live week at all (Lake Garda and Croatia between
 * seasons) stays: a voucher is value, and next season's week will take it.
 *
 * Packages: exactly what the booking flow sells, no more. Active, on the
 * website, not archived, priced, and on a live week (published, not archived,
 * not over) or on no week at all. A package on an event week is left out for
 * the same reason as a clinic. Each package keeps its own week; only true
 * duplicates (same week, same name, same price) collapse into one button.
 */
export function buildGiftCatalog(input: {
  experiences: GiftExpRow[];
  editions: GiftEditionRow[];
  packages: GiftPackageRow[];
  today: string; // yyyy-mm-dd
}): { experiences: GiftExp[]; packages: GiftPkg[] } {
  const { today } = input;
  const live = input.editions.filter((e) => {
    if (e.status !== "published" || e.archived_at) return false;
    const end = e.date_end || e.date_start;
    return !end || end >= today;
  });
  const liveById = new Map(live.map((e) => [e.id, e]));
  const liveByExp = new Map<string, GiftEditionRow[]>();
  for (const e of live) liveByExp.set(e.experience_id, [...(liveByExp.get(e.experience_id) ?? []), e]);

  const isClinic = (x: GiftExpRow) => {
    if (x.page_template === "event") return true;
    const weeks = liveByExp.get(x.id) ?? [];
    return weeks.length > 0 && weeks.every((e) => e.kind === "event");
  };
  const giftable = input.experiences.filter((x) => !isClinic(x));
  const giftableIds = new Set(giftable.map((x) => x.id));

  const byKey = new Map<string, GiftPkg>();
  for (const p of input.packages) {
    if (!giftableIds.has(p.experience_id)) continue;
    if (p.archived_at || p.status !== "active" || p.website_visible === false) continue;
    const price = p.price == null ? NaN : Number(p.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    let week: GiftEditionRow | null = null;
    if (p.edition_id) {
      week = liveById.get(p.edition_id) ?? null;
      if (!week || week.kind === "event") continue;
    }
    const name = giftPackageName(p.name);
    if (!name) continue;
    const key = `${p.experience_id}|${week?.id ?? ""}|${name.toLowerCase()}|${price}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: p.id,
      name,
      price,
      experience_id: p.experience_id,
      week: week ? giftWeekLabel(week.date_start, week.date_end) : null,
      week_start: week?.date_start ?? null,
    });
  }

  return {
    experiences: giftable.map((x) => ({ id: x.id, title: x.title, currency: x.currency ?? null })),
    packages: [...byKey.values()],
  };
}

/** Published experiences + their hero images + the packages a voucher can be
 *  matched to, for the gift voucher buy form. Shared by the public gift page
 *  and the in-portal one. */
export async function loadGiftData(): Promise<{ experiences: GiftExp[]; heroes: string[]; packages: GiftPkg[] }> {
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
        sb.from("exp_editions").select("id, experience_id, status, kind, date_start, date_end, archived_at").in("experience_id", ids),
        sb.from("exp_packages").select("id, name, price, experience_id, edition_id, sort_order, status, website_visible, archived_at").in("experience_id", ids).order("sort_order"),
      ])
    : [{ data: [] }, { data: [] }];

  const today = new Date().toISOString().slice(0, 10);
  const { experiences, packages } = buildGiftCatalog({
    experiences: rows as GiftExpRow[],
    editions: (edRows ?? []) as GiftEditionRow[],
    packages: (pkgRows ?? []) as GiftPackageRow[],
    today,
  });

  // Photo band: the heroes of the experiences the form actually offers, so a
  // clinic that cannot be gifted does not headline the page.
  const shown = new Set(experiences.map((e) => e.id));
  const heroIds = ids.filter((id) => shown.has(id));
  const { data: content } = heroIds.length ? await sb.from("exp_content").select("experience_id, hero_image").in("experience_id", heroIds) : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byExp = new Map((content ?? []).map((c: any) => [c.experience_id, c.hero_image]));
  const heroes = [...new Set(rows.filter((e) => shown.has(e.id)).map((e) => byExp.get(e.id) || e.hero_image).filter(Boolean))] as string[];

  return { experiences, heroes, packages };
}
