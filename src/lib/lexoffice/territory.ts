/**
 * DRITTLAND / EU / UNKLAR for one trip destination.
 *
 * Why this file is not a one-line country lookup:
 *
 * Under § 25 Abs. 2 UStG the margin on a trip is tax free only where the
 * travel pre-services are performed in a third country. Whether somewhere is a
 * third country is a question about the EU VAT TERRITORY (Art. 5-7 MwStSystRL),
 * not about the political map, and the two disagree in exactly the places NP7
 * sells:
 *
 *   - Tenerife and Fuerteventura are Spain. The Canary Islands are outside the
 *     EU VAT territory, so the margin there is tax free. A plain country lookup
 *     returns "Spain -> EU" and gets it backwards.
 *   - Bonaire is constitutionally Dutch. The BES islands are outside the EU VAT
 *     territory. Same trap.
 *   - Norway is in the EEA and in Schengen and is still a third country here.
 *
 * The accounting plan is explicit about the cost of getting this wrong, and
 * about what to do when unsure: "Im Zweifel UNKLAR schreiben und fragen.
 * Falsch raten kostet echtes Geld." So this classifier is deliberately built to
 * abstain. It answers EU or DRITTLAND only from an explicit list. Anything it
 * has not been told about comes back UNKLAR, which is a real answer that the
 * tax practice can act on, rather than a guess that looks like one.
 *
 * `destinations.vat_territory` overrides everything below. When the practice
 * rules on a place, that ruling is recorded there and this file is not touched.
 */

export type VatTerritory = "DRITTLAND" | "EU" | "UNKLAR";

/** Countries wholly inside the EU VAT territory, minus the exclusions below. */
const EU_VAT_COUNTRIES = new Set([
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia", "czech republic",
  "denmark", "estonia", "finland", "france", "germany", "greece", "hungary", "ireland",
  "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "poland",
  "portugal", "romania", "slovakia", "slovenia", "spain", "sweden",
  // German spellings, because the destination table is edited by hand.
  "belgien", "bulgarien", "dänemark", "daenemark", "deutschland", "estland", "finnland",
  "frankreich", "griechenland", "irland", "italien", "kroatien", "lettland", "litauen",
  "luxemburg", "niederlande", "österreich", "oesterreich", "polen", "portugal",
  "rumänien", "rumaenien", "schweden", "slowakei", "slowenien", "spanien",
  "tschechien", "ungarn", "zypern",
]);

/**
 * Third countries NP7 actually sells or plausibly will. Listed by name rather
 * than derived as "not EU", because "not in my EU list" is not the same claim
 * as "I know this is a third country" and only the second one may be written
 * into a tax record.
 */
const THIRD_COUNTRIES = new Set([
  "united states", "usa", "united states of america", "vereinigte staaten",
  "turkey", "türkiye", "turkiye", "türkei", "tuerkei",
  "norway", "norwegen",
  "united kingdom", "uk", "great britain", "grossbritannien", "großbritannien",
  "switzerland", "schweiz",
  "iceland", "island",
  "south africa", "südafrika", "suedafrika",
  "madagascar", "madagaskar",
  "mauritius",
  "peru",
  "cape verde", "cabo verde", "kap verde", "kapverden",
  "morocco", "marokko",
  "egypt", "ägypten", "aegypten",
  "brazil", "brasilien",
  "chile", "australia", "australien", "new zealand", "neuseeland",
  "dominican republic", "dominikanische republik",
  "aruba", "curacao", "curaçao", "sint maarten",
  // Bonaire is filed under this in the destination table. It is not a country,
  // but it is unambiguous about which VAT territory it means: the Dutch
  // Caribbean is outside the EU VAT area whichever island is meant.
  "dutch caribbean", "caribbean netherlands", "bonaire",
]);

/**
 * Territories of an EU member state that sit OUTSIDE the EU VAT territory.
 * Matched against the destination's region and name as well as its country,
 * because "Tenerife / Spain / Canary Islands" only reveals itself in the region.
 */
const EXCLUDED_TERRITORIES: { needles: string[]; label: string }[] = [
  { needles: ["canary island", "canaries", "kanaren", "kanarische"], label: "Canary Islands" },
  { needles: ["tenerife", "teneriffa", "fuerteventura", "lanzarote", "gran canaria", "la palma", "la gomera", "el hierro"], label: "Canary Islands" },
  { needles: ["ceuta", "melilla"], label: "Ceuta / Melilla" },
  { needles: ["bonaire", "saba", "sint eustatius", "caribbean netherlands", "dutch caribbean"], label: "Caribbean Netherlands" },
  { needles: ["guadeloupe", "martinique", "réunion", "reunion", "mayotte", "french guiana", "guyane"], label: "French overseas departments" },
  { needles: ["livigno", "campione"], label: "Livigno / Campione d'Italia" },
  { needles: ["büsingen", "buesingen", "helgoland", "heligoland"], label: "Büsingen / Helgoland" },
  { needles: ["mount athos", "agion oros", "athos"], label: "Mount Athos" },
  { needles: ["åland", "aland", "ahvenanmaa"], label: "Åland Islands" },
  { needles: ["madeira", "azores", "azoren"], label: "Madeira / Azores" },
];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export type TerritoryVerdict = {
  territory: VatTerritory;
  /** Why, in one line, for the admin and for the audit trail. */
  reason: string;
  /** True when a human recorded this on the destination rather than deriving it. */
  overridden: boolean;
};

/**
 * Classify a destination.
 *
 * `override` is `destinations.vat_territory` and always wins: it is the tax
 * practice's answer, and nothing derived may quietly contradict it.
 */
export function classifyTerritory(input: {
  country?: string | null;
  region?: string | null;
  name?: string | null;
  override?: string | null;
}): TerritoryVerdict {
  const ov = norm(input.override);
  if (ov === "third_country" || ov === "drittland") {
    return { territory: "DRITTLAND", reason: "recorded on the destination", overridden: true };
  }
  if (ov === "eu") return { territory: "EU", reason: "recorded on the destination", overridden: true };
  if (ov === "unclear" || ov === "unklar") {
    return { territory: "UNKLAR", reason: "flagged unclear on the destination", overridden: true };
  }

  const haystack = [norm(input.country), norm(input.region), norm(input.name)].join(" | ");

  // Excluded territories are checked FIRST. Tenerife's country says Spain, and
  // if that were read first the Canaries would be classified EU and the margin
  // taxed that should not be.
  for (const t of EXCLUDED_TERRITORIES) {
    if (t.needles.some((n) => haystack.includes(n))) {
      return {
        territory: "DRITTLAND",
        reason: `${t.label} is outside the EU VAT territory`,
        overridden: false,
      };
    }
  }

  const country = norm(input.country);
  if (!country) return { territory: "UNKLAR", reason: "the destination has no country", overridden: false };
  if (THIRD_COUNTRIES.has(country)) {
    return { territory: "DRITTLAND", reason: `${input.country} is a third country`, overridden: false };
  }
  if (EU_VAT_COUNTRIES.has(country)) {
    return { territory: "EU", reason: `${input.country} is in the EU VAT territory`, overridden: false };
  }
  return {
    territory: "UNKLAR",
    reason: `${input.country} is not in the list either way, so this needs a ruling`,
    overridden: false,
  };
}
