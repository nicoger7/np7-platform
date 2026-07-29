// Shared NP7 Hardware product types — the contract between the admin editor,
// the API routes, and the public product page. Keep in sync with migration
// 20260614_020_hw_product_pages.sql.

/** Hardware brand accent (amber) — distinct from Experience cyan. */
export const HW_ACCENT = "#f59e0b";

/** Named icons an editor can pick for a Find-Your-Fit persona (no SVG stored in DB). */
export const FIT_ICONS = ["spark", "wave", "target", "users", "trophy", "compass", "rocket", "shield"] as const;
export type FitIcon = (typeof FIT_ICONS)[number];

/** One "Find Your Fit" persona on a product page. Stored as a jsonb array element. */
export type FitSegment = {
  id: string;
  chip: string;        // tab/button label, e.g. "I want speed"
  tag: string;         // small badge, e.g. "The racer"
  title: string;       // panel heading
  body: string;        // panel paragraph
  points: string[];    // bullet list
  cta: string;         // CTA label
  cta_href: string;    // CTA link (e.g. "#buy" or another product)
  icon: FitIcon;       // one of FIT_ICONS
  image: string;       // image URL (storage)
};

export type SpecRow = { label: string; value: string };

/** Per-product website content (hw_product_content). */
export type ProductContent = {
  hero_image: string | null;
  /** CSS object-position for the hero, e.g. "50% 40%" (null = centre) */
  hero_focus: string | null;
  /** the card/tile crop — falls back to the hero image + focus when empty */
  tile_image: string | null;
  tile_focus: string | null;
  hero_video_url: string | null;
  gallery: string[];
  tagline: string | null;
  overview: string | null;
  highlights: string[];
  spec_rows: SpecRow[];
  find_your_fit: FitSegment[];
};

/** Core product record (hw_products) — fields used by the public page + admin. */
export type Product = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  category: string;
  template: string;
  price: number | null;
  compare_at_price: number | null;
  cost: number | null;
  currency: string;
  sku: string | null;
  stock_count: number | null;
  description: string | null;
  images: string[] | null;
  specs: Record<string, unknown> | null;
  status: string | null;
  year: number | null;
};

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;

/** DB-constrained product categories (hw_products_category_check). */
export const PRODUCT_CATEGORIES = ["boards", "fins", "foils", "accessories"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** A blank fit row for the admin editor. */
export function emptyFit(): FitSegment {
  return { id: crypto.randomUUID(), chip: "", tag: "", title: "", body: "", points: [""], cta: "", cta_href: "#buy", icon: "spark", image: "" };
}
