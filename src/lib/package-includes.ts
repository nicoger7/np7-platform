import { includeLine } from "@/lib/include-line";

/**
 * What a package includes, as display lines.
 *
 * This lived as an inline IIFE on the trip page. Clinics need the same list for
 * their "what's included" chips, and the repo already carries several
 * disagreeing copies of this coercion — so it moves here rather than gaining
 * another one. The trip page keeps appending its own member-area line after
 * calling this; that part is week-specific and stays where it was.
 *
 * Two sources, in order:
 *  1. `exp_packages.includes` — the hand-written override, when someone has
 *     filled it in. It wins outright: a human wrote it for this package.
 *  2. The components ✓-checked for the website, each rendered with its own
 *     website text (`exp_components.description`, name as fallback).
 */

/** Coerce the jsonb `exp_packages.includes` into clean display strings. */
export function parseIncludes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) =>
      typeof it === "string"
        ? it
        : it && typeof it === "object"
          ? String((it as Record<string, unknown>).name ?? (it as Record<string, unknown>).label ?? (it as Record<string, unknown>).text ?? "")
          : "",
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Fixed order, not database order.
 *
 * The join returns rows in whatever order it likes, so two weeks holding the
 * SAME components listed them differently and the two copies read as different
 * products. Coaching first (it is the trip), then where you sleep, then the rest.
 */
const RANK: Record<string, number> = { coaching: 0, accommodation: 1, gear: 2, meals: 3, transport: 4, other: 5 };
const rank = (c?: string | null) => RANK[(c ?? "").toLowerCase()] ?? 6;

export type IncludeComponentLink = {
  show_on_website?: boolean | null;
  quantity?: number | null;
  exp_components?: { name?: string | null; description?: string | null; category?: string | null } | null;
} | null;

export function packageIncludes(pkg: {
  includes?: unknown;
  exp_package_components?: IncludeComponentLink[] | null;
}): string[] {
  const manual = parseIncludes(pkg.includes);
  if (manual.length) return manual;
  return (pkg.exp_package_components ?? [])
    .filter((l) => l?.show_on_website)
    .slice()
    .sort((a, b) => {
      const d = rank(a?.exp_components?.category) - rank(b?.exp_components?.category);
      return d !== 0 ? d : (a?.exp_components?.name ?? "").localeCompare(b?.exp_components?.name ?? "");
    })
    .map((l) => includeLine({ ...l?.exp_components, quantity: l?.quantity }))
    .filter(Boolean);
}

/**
 * The NP7 member area rides on every package — a trip week and a clinic seat
 * alike. It is not a component anyone would think to attach, and it is not
 * optional, so it is appended rather than configured.
 *
 * What it PROMISES follows the run's own media flags, so a week that shoots no
 * video never sells video-analysis clips. A hand-written mention wins outright:
 * if someone has already written the member area into the list, they meant
 * their wording, not ours.
 */
export function withMemberArea(
  base: string[],
  opts: { video?: boolean | null; photo?: boolean | null; unit?: "week" | "clinic" } = {},
): string[] {
  if (base.some((t) => /member area/i.test(t))) return base;
  const video = opts.video !== false;
  const photo = opts.photo !== false;
  const unit = opts.unit ?? "week";
  const media = video && photo
    ? `all your ${unit}'s photos & videos, `
    : photo ? `all your ${unit}'s photos, `
    : video ? "your video-analysis clips, "
    : "";
  const docs = unit === "clinic" ? "clinic documents" : "trip documents";
  return [...base, `NP7 member area — ${media}${docs} & progress tracker`];
}
