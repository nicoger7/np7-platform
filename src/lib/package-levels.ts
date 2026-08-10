/**
 * The coaching levels a package can be sold at. One list, imported everywhere.
 *
 * There were two hardcoded copies of this — the standalone Packages page
 * offered "advanced", the edition's Packages tab offered "pro" — for the same
 * column, exp_packages.category. Whichever screen you happened to be on decided
 * the word, and the word is load-bearing: exp_edition_level_caps.level joins on
 * it to cap each group, and the public picker splits packages by it. A package
 * saved as "pro" matches no cap and no group, so it sells past the level's
 * limit and lands in its own tab on the website. One package was already in
 * that state.
 *
 * NOT the same thing as a RIDER's level (member-level.ts LEVELS: Beginner …
 * Pro). That describes a person's ability; this describes which coaching group
 * a package buys. They overlap in wording and must not be merged — a "mixed"
 * package has no rider equivalent.
 */
export const PACKAGE_LEVELS = ["advanced", "beginner", "mixed"] as const;
export type PackageLevel = (typeof PACKAGE_LEVELS)[number];

/** With the empty option first, for a <select>. */
export const PACKAGE_LEVEL_OPTIONS: string[] = ["", ...PACKAGE_LEVELS];

/** "advanced" → "Advanced"; "" → "None". */
export function packageLevelLabel(v: string): string {
  if (!v) return "None";
  return v[0].toUpperCase() + v.slice(1);
}
