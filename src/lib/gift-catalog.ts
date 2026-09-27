import { packageLevelLabel } from "@/lib/package-levels";

/*
 * Pure: no database, no server imports, so the chooser (a client component)
 * can use the same helpers the server shapes the data with. The loader is in
 * gift-data.ts.
 *
 * What the gift voucher chooser offers, shaped as the steps a buyer walks
 * through (Nico, 27 Sep 2026: "make it easily bookable and choosable
 * (package etc.)"):
 *
 *   trip  ->  week  ->  level  ->  room or package  ->  the voucher's value
 *
 * Round 1 sent one flat list of packages and the form grouped it by week. Two
 * things went wrong with that. Bonaire sells the same room at two coaching
 * levels ("WANAPA Double Deluxe with Balcony" is €3,490 for Beginner and
 * €4,150 for Advanced), and the form showed two identical names with two
 * prices and nothing to tell them apart. And Alaçatı sells "Advanced · Standard
 * Room" at two hotels on the same week, €4,350 and €5,100, again as two
 * identical buttons. The level lives in exp_packages.category and the hotel in
 * exp_packages.hotel_id, so the data now carries both and the form asks.
 *
 * No `price` on the trip (Nico, 27 Sep 2026). exp_experiences.price stopped
 * deciding any money and must not be shipped to the browser either: anyone
 * reading the page source took it as a price.
 */

/** One room or package a voucher can be matched to, on one week. */
export type GiftPackage = {
  id: string;
  /** Clean name: week code dropped, long dashes as a middot, and the level
   *  word dropped when it only repeats `level` ("Advanced · Standard Room"
   *  on an advanced package reads "Standard Room"). */
  name: string;
  /** exp_packages.category: 'beginner' | 'advanced' | 'mixed', or null. */
  level: string | null;
  price: number;
  /** The linked hotel's name, for the card's short line. */
  hotel: string | null;
};

/** One live week that has something to match a voucher to. */
export type GiftWeek = {
  id: string;
  /** "30 Nov - 6 Dec 2026". */
  dates: string;
  /** The edition's own label ("Week I"), dashes cleaned, or null. */
  label: string | null;
  start: string | null;
  /** The levels this week sells, Beginner first. Two or more means the form
   *  asks which one. */
  levels: string[];
  /** Cheapest first. */
  packages: GiftPackage[];
};

/** A trip that can be gifted. `weeks` holds only weeks with packages on sale:
 *  a trip whose weeks have none yet (Lake Garda and Croatia before their
 *  prices are out) is still giftable, by value. */
export type GiftTrip = {
  id: string;
  title: string;
  /** "Bonaire" for "NP7 Experience Bonaire": what a chip and a sentence say. */
  name: string;
  currency: string | null;
  weeks: GiftWeek[];
};

// Row shapes as they come out of the database. Loose on purpose: a missing
// column reads as undefined and every rule below treats that as "not set".
export type GiftExpRow = { id: string; title: string; currency?: string | null; page_template?: string | null };
export type GiftEditionRow = {
  id: string;
  experience_id: string;
  label?: string | null;
  status?: string | null;
  kind?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  archived_at?: string | null;
  /** exp_editions.public_from (migration 170): the day the week opens to
   *  everyone. Before it, only Crew/Legend members and the team see it. */
  public_from?: string | null;
};
export type GiftPackageRow = {
  id: string;
  name: string | null;
  price: number | string | null;
  experience_id: string;
  edition_id?: string | null;
  category?: string | null;
  hotel_id?: string | null;
  status?: string | null;
  website_visible?: boolean | null;
  archived_at?: string | null;
};
export type GiftHotelRow = { id: string; name: string | null };

/**
 * Is this week still in its early-access window? A published week with a
 * `public_from` after today is the Crew/Legend perk "book before everyone
 * else" (migration 170): the trip page and the experience cards hide it from
 * everyone else until that day. The gift chooser showed its dates and prices
 * to anyone, and /api/voucher sold a voucher priced from it (review,
 * 28 Sep 2026). Both ask this, so the gift side opens a week on the same day
 * the booking side does. Compared as yyyy-mm-dd strings, like the trip page.
 */
export function isEarlyAccessWeek(publicFrom: string | null | undefined, today: string): boolean {
  return !!publicFrom && String(publicFrom).slice(0, 10) > today;
}

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

/** Long dashes out of a label the team typed: a middot between words, a plain
 *  hyphen between numbers ("OBX Wind · 10-16 October"). */
function cleanDashes(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The name a guest reads on a package. Drops a leading week code ("BON1 - ")
 * because the chooser says the week in words, and turns the long dashes some
 * package names carry ("Advanced – Standard Room", "OBX Clinic — Ticket") into
 * a middot, the way the rest of the guest copy reads.
 */
export function giftPackageName(raw: unknown): string {
  const full = String(raw || "").trim();
  const tier = full.replace(/^[A-Za-z]{2,5}\s*\d+\s*[-–—]\s*/, "").trim() || full;
  return cleanDashes(tier);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The package name with its level word dropped when the level is already
 * said: "Advanced · Standard Room" and "No Hotel - Beginner" become
 * "Standard Room" and "No Hotel" once the buyer has picked the level. A name
 * that is nothing but the level stays as it is, so no card is ever blank.
 */
export function giftPackageTitle(raw: unknown, level: string | null | undefined): string {
  const base = giftPackageName(raw);
  const lvl = String(level ?? "").trim();
  if (!lvl) return base;
  const L = escapeRe(lvl);
  const stripped = base
    .replace(new RegExp(`^${L}\\s*(?:·|-|:)\\s*`, "i"), "")
    .replace(new RegExp(`\\s*(?:·|-|:)\\s*${L}$`, "i"), "")
    .replace(new RegExp(`\\s*\\(${L}\\)$`, "i"), "")
    .trim();
  return stripped || base;
}

/** "NP7 Experience Bonaire" reads "Bonaire" on a chip; any other title is
 *  left whole. */
export function giftTripName(title: string): string {
  const short = String(title || "").replace(/^NP7\s+Experience\s+/i, "").trim();
  return short || String(title || "").trim();
}

/** "Beginner", "Advanced", "Mixed" from exp_packages.category. */
export function giftLevelLabel(level: string | null | undefined): string {
  return level ? packageLevelLabel(level) : "";
}

const LEVEL_ORDER = ["beginner", "advanced", "mixed"];
const levelRank = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i === -1 ? LEVEL_ORDER.length : i;
};

/**
 * The hint under "Which level?": the groups this week really sells, in the
 * week's own order. It was hardcoded "Beginner and Advanced", which names the
 * wrong groups on a week that sells Mixed plus one other level (review,
 * 28 Sep 2026). "Beginner and Advanced", "Beginner, Advanced and Mixed".
 */
export function giftLevelHint(levels: readonly string[]): string {
  const names = levels.map(giftLevelLabel).filter(Boolean);
  if (names.length < 2) return "";
  const list = names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ride in separate coaching groups.`;
}

/** Does this week need the level step? Only when it sells two or more levels. */
export function giftWeekNeedsLevel(week: Pick<GiftWeek, "levels">): boolean {
  return week.levels.length >= 2;
}

/**
 * The cards step 4 shows. With a level picked, that level's packages plus any
 * package with no level (it is sold to both groups). Without one, everything
 * the week sells.
 */
export function giftPackagesFor(week: Pick<GiftWeek, "packages">, level: string | null | undefined): GiftPackage[] {
  if (!level) return week.packages;
  return week.packages.filter((p) => p.level === level || p.level == null);
}

/** Cheapest package price in a list, for "from €2,390" on a week or level. */
export function giftFromPrice(pkgs: GiftPackage[]): number | null {
  return pkgs.length ? Math.min(...pkgs.map((p) => p.price)) : null;
}

/**
 * What the gift chooser may offer, worked out from plain rows so it can be
 * tested without a database (Nico, 27 Sep 2026).
 *
 * Trips: every experience the caller passes (published and on the website),
 * that is not an event template and has at least one live week that is not an
 * event. A clinic is booked through a card checkout that charges the whole
 * ticket at once and has no voucher field, so a clinic voucher could never be
 * used. A trip with no live week at all has nothing to point a buyer at yet
 * and waits until one is published.
 *
 * Weeks: live (published, not archived, not over, open to everyone: no
 * `public_from` still ahead) and not an event, soonest first. A week is
 * offered only when it has a package on sale; the trip stays giftable by
 * value either way.
 *
 * Packages: exactly what the booking flow sells. Active, on the website, not
 * archived, priced, on one of those weeks. A package with no week is sold on
 * every week, as on the trip page, unless that week has its own package with
 * the same level and name, which overrides it. Only true duplicates (same
 * week, level, name, hotel and price) collapse into one card: the same room
 * at two levels, or the same name at two hotels, stays two cards.
 */
export function buildGiftCatalog(input: {
  experiences: GiftExpRow[];
  editions: GiftEditionRow[];
  packages: GiftPackageRow[];
  hotels?: GiftHotelRow[];
  today: string; // yyyy-mm-dd
}): { trips: GiftTrip[] } {
  const { today } = input;
  const hotelName = new Map((input.hotels ?? []).map((h) => [h.id, String(h.name ?? "").trim() || null]));

  const liveWeeksByExp = new Map<string, GiftEditionRow[]>();
  for (const e of input.editions) {
    if (e.status !== "published" || e.archived_at || e.kind === "event") continue;
    const end = e.date_end || e.date_start;
    if (end && String(end).slice(0, 10) < today) continue;
    // Not public yet: an early-access week is the loyalty perk, not a gift.
    if (isEarlyAccessWeek(e.public_from, today)) continue;
    liveWeeksByExp.set(e.experience_id, [...(liveWeeksByExp.get(e.experience_id) ?? []), e]);
  }

  type Sellable = GiftPackage & { expId: string; weekId: string | null; key: string };
  const sellable: Sellable[] = [];
  for (const p of input.packages) {
    if (p.archived_at || p.status !== "active" || p.website_visible === false) continue;
    const price = p.price == null ? NaN : Number(p.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const level = String(p.category ?? "").trim().toLowerCase() || null;
    const name = giftPackageTitle(p.name, level);
    if (!name) continue;
    sellable.push({
      id: p.id,
      name,
      level,
      price,
      hotel: p.hotel_id ? hotelName.get(p.hotel_id) ?? null : null,
      expId: p.experience_id,
      weekId: p.edition_id ?? null,
      key: `${level ?? ""}|${name.toLowerCase()}`,
    });
  }

  const trips: GiftTrip[] = [];
  for (const x of input.experiences) {
    if (x.page_template === "event") continue;
    const live = [...(liveWeeksByExp.get(x.id) ?? [])].sort((a, b) =>
      (a.date_start ?? "9999").localeCompare(b.date_start ?? "9999"),
    );
    if (live.length === 0) continue;

    const mine = sellable.filter((p) => p.expId === x.id);
    const shared = mine.filter((p) => !p.weekId);

    const weeks: GiftWeek[] = [];
    for (const w of live) {
      const own = mine.filter((p) => p.weekId === w.id);
      const claimed = new Set(own.map((p) => p.key));
      const all = [...own, ...shared.filter((p) => !claimed.has(p.key))];

      const seen = new Set<string>();
      const packages: GiftPackage[] = [];
      for (const p of all) {
        const dup = `${p.key}|${p.hotel ?? ""}|${p.price}`;
        if (seen.has(dup)) continue;
        seen.add(dup);
        packages.push({ id: p.id, name: p.name, level: p.level, price: p.price, hotel: p.hotel });
      }
      if (packages.length === 0) continue;
      packages.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

      const levels = [...new Set(packages.map((p) => p.level).filter((l): l is string => !!l))]
        .sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b));

      weeks.push({
        id: w.id,
        dates: giftWeekLabel(w.date_start, w.date_end) ?? (w.label ? cleanDashes(w.label) : "Date to be announced"),
        label: w.label ? cleanDashes(w.label) : null,
        start: w.date_start ?? null,
        levels,
        packages,
      });
    }

    trips.push({ id: x.id, title: x.title, name: giftTripName(x.title), currency: x.currency ?? null, weeks });
  }

  return { trips };
}

/* ─── The chooser's state, worked out in one place ───────────────────────── */

/** "Any NP7 trip" in the chooser's trip state, next to real experience ids. */
export const GIFT_ANY_TRIP = "any";

export type GiftChoiceState = {
  /** null = nothing picked yet, GIFT_ANY_TRIP, or an experience id. */
  tripId: string | null;
  weekId: string | null;
  level: string | null;
  pkgId: string | null;
  /** The slider is open ("A set amount instead" or "Change amount"). */
  custom: boolean;
  /** Where the slider stands. */
  sliderAmount: number;
};

export type GiftChoice = {
  isAny: boolean;
  trip: GiftTrip | null;
  /** Step 2 shows: the trip has more than one week on sale. */
  askWeek: boolean;
  /** The week the price comes from: the picked one, or the only one. */
  week: GiftWeek | null;
  /** Step 3 shows: that week sells two levels or more. */
  askLevel: boolean;
  /** Step 4 shows, with these cards. */
  showCards: boolean;
  cards: GiftPackage[];
  pkg: GiftPackage | null;
  /** The value comes from the slider (any trip, no prices out yet, or a set amount). */
  byValue: boolean;
  amount: number;
  /** Enough is chosen to order. */
  ready: boolean;
  currency: string;
  /** What the order posts. */
  experienceId: string | null;
  packageId: string | null;
};

/**
 * What the chooser shows and what the order posts, from what was clicked.
 * Pure, so the rules are tested without a browser (Nico, 27 Sep 2026):
 *
 *  - a picked package sets the amount to its price, nothing else does;
 *  - one week on sale is not asked, it is that week;
 *  - the level is asked only when the week sells more than one;
 *  - "Any NP7 trip", and a trip with no prices out yet, go straight to an
 *    amount on the slider.
 */
export function giftChoice(trips: GiftTrip[], s: GiftChoiceState): GiftChoice {
  const isAny = s.tripId === GIFT_ANY_TRIP;
  const trip = !isAny && s.tripId ? trips.find((t) => t.id === s.tripId) ?? null : null;
  const weeks = trip?.weeks ?? [];
  const week = weeks.length === 1 ? weeks[0] : weeks.find((w) => w.id === s.weekId) ?? null;
  const askLevel = !!week && giftWeekNeedsLevel(week);
  const levelOk = !askLevel || (!!s.level && !!week && week.levels.includes(s.level));
  const showCards = !!week && levelOk;
  const cards = showCards && week ? giftPackagesFor(week, askLevel ? s.level : null) : [];
  const pkg = cards.find((p) => p.id === s.pkgId) ?? null;
  const byValue = isAny || (!!trip && weeks.length === 0) || (!!trip && s.custom);
  const amount = pkg ? pkg.price : s.sliderAmount;
  const ready = isAny || (!!trip && (!!pkg || byValue));
  return {
    isAny,
    trip,
    askWeek: weeks.length > 1,
    week,
    askLevel,
    showCards,
    cards,
    pkg,
    byValue,
    amount,
    ready,
    currency: trip?.currency || "EUR",
    experienceId: trip?.id ?? null,
    packageId: pkg?.id ?? null,
  };
}

/** "Advanced · Standard Room": the level said once, in front of the room. */
export function giftPackageLabel(p: Pick<GiftPackage, "name" | "level">): string {
  return p.level ? `${giftLevelLabel(p.level)} · ${p.name}` : p.name;
}

/**
 * The line under the voucher's value. A trip voucher is honest about its
 * reach: the redeem route accepts it on any week of THAT trip and refuses it
 * on another trip, so it says "any Bonaire week", never "any NP7 trip".
 */
export function giftValueLine(c: Pick<GiftChoice, "isAny" | "trip" | "week" | "pkg">): string {
  if (c.pkg && c.trip) {
    const pkg = c.pkg;
    const when = c.week ? `, ${c.week.dates}` : "";
    // Alaçatı sells "Standard Room" at two hotels on one week: name the hotel
    // when the room name alone does not say which price this is.
    const twin = c.week?.packages.some((o) => o.id !== pkg.id && o.level === pkg.level && o.name === pkg.name && o.hotel !== pkg.hotel);
    const what = twin && pkg.hotel ? `${giftPackageLabel(pkg)} · ${pkg.hotel}` : giftPackageLabel(pkg);
    return `Worth the ${what} price${when}. They can use it on any ${c.trip.name} week.`;
  }
  if (c.trip) return `A voucher for ${c.trip.title}. They can use it on any ${c.trip.name} week.`;
  return "A voucher for any NP7 trip. They can use it on any week.";
}
