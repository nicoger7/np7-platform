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

/** For pickers: label + year + date range, e.g. "Week I · 2026 (30 Nov – 6 Dec)". */
export function editionOptionLabel(ed: EditionLike | null | undefined): string {
  if (!ed) return "";
  const base = editionLabel(ed);
  if (!ed.date_start) return base;
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
