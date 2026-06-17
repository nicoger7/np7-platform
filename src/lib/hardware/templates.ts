// Product page template registry. A product stores a `template` id; the public
// page renders the ordered module list for that template. v1 ships one template
// ("board"); add more here without touching the page component's wiring.

export type ModuleKey =
  | "hero"
  | "overview"
  | "find_your_fit"
  | "specs"
  | "gallery"
  | "buy";

export type ProductTemplate = {
  id: string;
  label: string;
  /** Modules rendered top-to-bottom on the public product page. */
  modules: ModuleKey[];
};

export const PRODUCT_TEMPLATES: Record<string, ProductTemplate> = {
  board: {
    id: "board",
    label: "Board",
    modules: ["hero", "overview", "find_your_fit", "specs", "gallery", "buy"],
  },
};

export const DEFAULT_TEMPLATE = "board";

/** Template ids for an admin <select>. */
export const TEMPLATE_OPTIONS = Object.values(PRODUCT_TEMPLATES).map((t) => ({ id: t.id, label: t.label }));

export function getTemplate(id: string | null | undefined): ProductTemplate {
  return PRODUCT_TEMPLATES[id ?? ""] ?? PRODUCT_TEMPLATES[DEFAULT_TEMPLATE];
}
