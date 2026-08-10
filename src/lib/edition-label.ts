/**
 * Edition labels are only unique together with their year: "Week I" exists in
 * 2026 AND 2027. Every dropdown/list that shows editions from more than one
 * year must format through these helpers instead of `ed.label || ed.year`.
 */
export type EditionLike = {
  label?: string | null;
  year?: number | null;
  date_start?: string | null;
  date_end?: string | null;
};

/** Compact, unambiguous: "Week I · 2026" (or just "2026" / "Week I" if that's all we have). */
export function editionLabel(ed: EditionLike | null | undefined): string {
  if (!ed) return "";
  if (ed.label && ed.year != null && !ed.label.includes(String(ed.year))) {
    return `${ed.label} · ${ed.year}`;
  }
  return ed.label || (ed.year != null ? String(ed.year) : "");
}

const fmtDay = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * For pickers: label + year + date range, e.g. "Week I · 2026 (30 Nov – 6 Dec)".
 *
 * `experienceTitle` prefixes the place when the picker spans experiences — a
 * cross-experience dropdown full of bare "2026 (15 Mar – 22 Mar)" rows makes
 * the reader guess whose weeks they are, which is exactly what happened on the
 * Components filter. A dateless edition says "dates TBD" instead of standing
 * there as a naked year.
 */
export function editionOptionLabel(ed: EditionLike | null | undefined, experienceTitle?: string | null): string {
  if (!ed) return "";
  const place = (experienceTitle ?? "").trim().replace(/^NP7\s+(Experience\s+)?/i, "").replace(/\s+Experience$/i, "");
  const base = [place, editionLabel(ed)].filter(Boolean).join(" · ");
  if (!ed.date_start) return `${base} (dates TBD)`;
  const range =
    ed.date_end && ed.date_end !== ed.date_start
      ? `${fmtDay(ed.date_start)} – ${fmtDay(ed.date_end)}`
      : fmtDay(ed.date_start);
  return `${base} (${range})`;
}

/** Stable sort key: by year, then label, then start date. */
export function editionSortKey(ed: EditionLike | null | undefined): string {
  if (!ed) return "";
  return `${ed.year ?? 9999}|${ed.label ?? ""}|${ed.date_start ?? ""}`;
}
