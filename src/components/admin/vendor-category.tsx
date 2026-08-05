"use client";

/**
 * What kind of partner this is.
 *
 * vendors.category is text[] and always has been — several rows carry two or
 * three ("coach, other, general"), which is right: Nico is a coach AND the
 * owner. But both admin forms offered a single <select> of title-case words
 * ("Hotel", "Transport") and wrote the bare string into the array column, so
 * the options matched nothing already stored and every save risked flattening
 * a multi-category row to one value.
 *
 * Chips, plural, over the values actually in use. Anything already stored that
 * isn't in the canonical list still renders — dropping a value silently because
 * a newer list doesn't mention it is how data quietly disappears.
 */

export const VENDOR_CATEGORIES: { key: string; label: string }[] = [
  { key: "accommodation", label: "Hotel" },
  { key: "center", label: "Centre" },
  { key: "transport", label: "Transport" },
  { key: "catering", label: "Catering" },
  { key: "gear", label: "Gear" },
  { key: "coach", label: "Coach" },
  { key: "media", label: "Media" },
  { key: "other", label: "Other" },
];

const LABEL = new Map(VENDOR_CATEGORIES.map((c) => [c.key, c.label]));

/** Tolerant read: the column is text[], but a legacy row may hold a bare string. */
export function toCategories(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    // Postgres array literal that slipped through as text: {a,b}
    const m = v.trim().match(/^\{(.*)\}$/);
    return (m ? m[1].split(",") : [v]).map((x) => x.replace(/^"|"$/g, "").trim()).filter(Boolean);
  }
  return [];
}

export function categoryLabel(key: string): string {
  return LABEL.get(key) ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function VendorCategoryPicker({
  value, onChange, labelClass,
}: {
  value: unknown;
  onChange: (next: string[]) => void;
  labelClass: string;
}) {
  const current = toCategories(value);
  // Show stored values the canonical list has forgotten, so nothing vanishes.
  const extras = current.filter((c) => !LABEL.has(c));
  const toggle = (k: string) =>
    onChange(current.includes(k) ? current.filter((x) => x !== k) : [...current, k]);

  return (
    <div>
      <label className={labelClass}>What they are <span className="admin-faint font-normal">· pick any that fit</span></label>
      <div className="flex flex-wrap gap-1.5">
        {[...VENDOR_CATEGORIES, ...extras.map((k) => ({ key: k, label: categoryLabel(k) }))].map((c) => {
          const on = current.includes(c.key);
          return (
            <button key={c.key} type="button" onClick={() => toggle(c.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                on ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted hover:admin-heading"
              }`}
              style={on ? undefined : { border: "1px solid var(--admin-border)" }}>
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Read-only, for list rows. */
export function VendorCategories({ value }: { value: unknown }) {
  const cats = toCategories(value);
  if (!cats.length) return <span className="text-xs admin-faint">—</span>;
  return <span className="text-xs admin-muted truncate">{cats.map(categoryLabel).join(", ")}</span>;
}
