/**
 * The partners line on the Experience landing page: a small, quiet row of
 * monochrome logos (Nico, 6 Oct 2026: "a clean and small line 'partners'.
 * Surfcenter, JP, NeilPryde logos, monochrome and clean").
 *
 * Editable in Admin → Home → Experience landing (site_settings
 * `experience_landing_hero`, keys partners / partnersTitle / partnersHidden).
 * These defaults are the floor, so a missing or half-filled row never blanks
 * the line. Logos are drawn white by the page, whatever colour the file is.
 */

export type Partner = { name: string; logo: string; url: string };

export const PARTNERS_TITLE_DEFAULT = "Partners";

export const DEFAULT_PARTNERS: Partner[] = [
  { name: "Surfcenter", logo: "https://media.np-seven.com/logos/partners/surfcenter.png", url: "https://surfcenter-experience.com" },
  { name: "JP Australia", logo: "https://media.np-seven.com/logos/partners/jp-australia.svg", url: "https://jp-australia.com" },
  { name: "NeilPryde", logo: "https://media.np-seven.com/logos/partners/neilpryde.png", url: "https://www.neilpryde.com" },
];

/** The saved list, cleaned: rows without a logo are dropped, links must be
 *  http(s). An absent list falls back to the defaults; an empty saved list
 *  stays empty, because emptying it in the admin is a decision. */
export function readPartners(raw: unknown): Partner[] {
  if (!Array.isArray(raw)) return DEFAULT_PARTNERS;
  const t = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  return raw
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => ({ name: t(p.name), logo: t(p.logo), url: t(p.url) }))
    .filter((p) => p.logo)
    .map((p) => ({ ...p, url: /^https?:\/\//i.test(p.url) ? p.url : "" }));
}
