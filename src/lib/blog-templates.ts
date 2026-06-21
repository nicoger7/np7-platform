/**
 * Blog template registry — the single source of truth for the structured blog.
 *
 * Pure module (no JSX, no server deps) so the admin editor, the public
 * renderer, and the API can all import it. Each template declares a small set
 * of typed fields; the admin form renders an input per field and the public
 * page renders a block per field. Because both sides iterate the SAME config,
 * every post of a given kind always looks the same — editors just fill blanks.
 *
 * To add or change a template, edit only this file.
 */

export type World = "experience" | "hardware" | "technique" | "both";

/**
 * Sentinel `spot_name` marking a guide-level (whole-post) community note, as
 * opposed to a per-spot note. Lets guide-wide tips reuse the spot-notes table
 * and moderation pipeline without a new migration.
 */
export const GUIDE_NOTE_SCOPE = "__guide__";

export type BlogTemplateId =
  | "standard"
  | "equipment_review"
  | "product_intro"
  | "gear_guide"
  | "comparison"
  | "spotguide"
  | "technique_guide"
  | "masterclass";

/** How a field is edited (admin) and rendered (public). */
export type FieldKind =
  | "text" // single line
  | "textarea" // multi-line prose
  | "select" // one of options
  | "rating" // 0–5, shown as stars
  | "list" // string[]
  | "proscons" // { pros: string[]; cons: string[] }
  | "pairs" // { label: string; value: string }[]  → spec rows
  | "features" // { title: string; description: string }[]  → card grid
  | "steps" // { title: string; description: string }[]  → numbered
  | "callout" // multi-line, shown as an accented quote
  | "youtube" // url → embed
  | "image" // single image url (picker)
  | "windrose" // WindWindow — per-direction quality (best/good/no)
  | "frequency" // ConditionsAvail — per condition-type frequency (often/sometimes/never)
  | "spots" // Spot[] — a destination's spots, each with its own facts (see SPOT_FIELDS)
  | "options" // Option[] — compared options, each with pros/cons (see OPTION_FIELDS)
  | "matrix" // ComparisonMatrix — attributes compared across columns
  | "chapters"; // Chapter[] — long-form masterclass: chapters w/ intro, image & points + a TOC

/** Where the field appears in the fixed, consistent post frame. */
export type FieldSlot = "hero" | "facts" | "body";

export type TemplateField = {
  key: string;
  label: string;
  kind: FieldKind;
  slot: FieldSlot;
  hint?: string;
  placeholder?: string;
  options?: string[]; // for select
  factIcon?: string; // icon key for the facts strip (see blog-icons)
  listStyle?: "check" | "warn" | "bullet"; // for list
};

export type BlogTemplate = {
  id: BlogTemplateId;
  label: string; // shown as the category chip + admin picker
  shortLabel: string;
  world: World;
  icon: string; // icon key (see components/blog/blog-icons)
  tagline: string; // admin picker description
  /** Optional CTA shown at the foot of the post. url/label live in template_data. */
  cta?: { defaultLabel: string };
  fields: TemplateField[];
};

/* --------------------------------------------------------------------------
 * The templates
 * ------------------------------------------------------------------------ */

const STANDARD: BlogTemplate = {
  id: "standard",
  label: "Article",
  shortLabel: "Article",
  world: "experience",
  icon: "article",
  tagline: "A plain story or news post — just a title, cover and your words.",
  fields: [],
};

const EQUIPMENT_REVIEW: BlogTemplate = {
  id: "equipment_review",
  label: "Equipment Review",
  shortLabel: "Review",
  world: "hardware",
  icon: "review",
  tagline: "Rate a board, fin, sail or foil — verdict, score, pros & cons, specs.",
  cta: { defaultLabel: "See it in the shop" },
  fields: [
    { key: "productName", label: "Product", kind: "text", slot: "hero", placeholder: "NP7 Freewave 95" },
    { key: "verdict", label: "Verdict", kind: "text", slot: "hero", hint: "The one-line takeaway, shown large.", placeholder: "A do-it-all freewave that flatters every session." },
    { key: "rating", label: "Rating", kind: "rating", slot: "facts", factIcon: "star" },
    { key: "bestFor", label: "Best for", kind: "text", slot: "facts", factIcon: "target", placeholder: "Intermediate freeriders" },
    { key: "priceNote", label: "Price", kind: "text", slot: "facts", factIcon: "tag", placeholder: "from €1,290" },
    { key: "proscons", label: "Pros & cons", kind: "proscons", slot: "body" },
    { key: "specs", label: "Specifications", kind: "pairs", slot: "body", hint: "Label → value, e.g. Volume → 95 L." },
    { key: "ctaUrl", label: "Shop link (URL)", kind: "text", slot: "body", hint: "Link to the product page — adds a button at the end.", placeholder: "/hardware/freewave-95" },
    { key: "ctaLabel", label: "Shop button text", kind: "text", slot: "body", placeholder: "See it in the shop" },
  ],
};

const PRODUCT_INTRO: BlogTemplate = {
  id: "product_intro",
  label: "New Product",
  shortLabel: "Launch",
  world: "hardware",
  icon: "rocket",
  tagline: "Introduce a new board or fin — the story, what's new, specs & launch info.",
  cta: { defaultLabel: "Discover the product" },
  fields: [
    { key: "productName", label: "Product", kind: "text", slot: "hero", placeholder: "NP7 Glide Foil 1200" },
    { key: "tagline", label: "Tagline", kind: "text", slot: "hero", hint: "A short punchy line under the title.", placeholder: "Early flight, endless glide." },
    { key: "availability", label: "Available", kind: "text", slot: "facts", factIcon: "calendar", placeholder: "Spring 2026" },
    { key: "price", label: "Price", kind: "text", slot: "facts", factIcon: "tag", placeholder: "from €1,490" },
    { key: "category", label: "Category", kind: "text", slot: "facts", factIcon: "box", placeholder: "Foil" },
    { key: "highlights", label: "What's new", kind: "features", slot: "body", hint: "2–4 headline innovations." },
    { key: "specs", label: "Key specs", kind: "pairs", slot: "body" },
    { key: "ctaUrl", label: "Product link (URL)", kind: "text", slot: "body", hint: "Adds a button at the end.", placeholder: "/hardware/glide-1200" },
    { key: "ctaLabel", label: "Button text", kind: "text", slot: "body", placeholder: "Discover the product" },
  ],
};

const GEAR_GUIDE: BlogTemplate = {
  id: "gear_guide",
  label: "Gear Guide",
  shortLabel: "Guide",
  world: "hardware",
  icon: "ruler",
  tagline: "Help riders choose the right gear — the factors, a sizing table, rules of thumb & mistakes.",
  cta: { defaultLabel: "Shop the range" },
  fields: [
    { key: "subject", label: "Subject", kind: "text", slot: "hero", placeholder: "Windsurf fins" },
    { key: "outcome", label: "What you'll learn", kind: "text", slot: "hero", hint: "Shown under the title.", placeholder: "How to pick the right fin size for your board, sail and conditions." },
    { key: "bestFor", label: "Best for", kind: "text", slot: "facts", factIcon: "target", placeholder: "Freeride & slalom sailors" },
    { key: "ruleOfThumb", label: "Rule of thumb", kind: "text", slot: "facts", factIcon: "ruler", placeholder: "Board width ÷ 2 + a few cm" },
    { key: "factors", label: "What decides it", kind: "features", slot: "body", hint: "The things that drive the choice." },
    { key: "guideCallout", label: "Key takeaway", kind: "callout", slot: "body", placeholder: "Stay within ±3 cm of the recommended size — beyond that you upset the whole setup." },
    { key: "sizingTable", label: "Sizing guide", kind: "pairs", slot: "body", hint: "Scenario → adjustment, e.g. Bigger sail → +1–2 cm." },
    { key: "mistakes", label: "Common mistakes", kind: "list", slot: "body", listStyle: "warn" },
    { key: "tips", label: "Pro tips", kind: "list", slot: "body", listStyle: "check" },
    { key: "ctaUrl", label: "Shop link (URL)", kind: "text", slot: "body", hint: "Adds a button at the end.", placeholder: "/hardware" },
    { key: "ctaLabel", label: "Button text", kind: "text", slot: "body", placeholder: "Shop the range" },
  ],
};

const COMPARISON: BlogTemplate = {
  id: "comparison",
  label: "Comparison",
  shortLabel: "Compare",
  world: "hardware",
  icon: "compare",
  tagline: "Compare options head-to-head — each profiled, a side-by-side table, and which to pick.",
  cta: { defaultLabel: "Shop the range" },
  fields: [
    { key: "subject", label: "Subject", kind: "text", slot: "hero", placeholder: "Freeride vs Freerace vs Race sails" },
    { key: "outcome", label: "What you'll decide", kind: "text", slot: "hero", hint: "Shown under the title.", placeholder: "Which sail type fits your level, conditions and priorities." },
    { key: "forWho", label: "For", kind: "text", slot: "facts", factIcon: "target", placeholder: "Intermediate–advanced" },
    { key: "category", label: "Category", kind: "text", slot: "facts", factIcon: "box", placeholder: "Sails" },
    { key: "options", label: "The options", kind: "options", slot: "body", hint: "Each option — who it's for, pros & cons." },
    { key: "matrix", label: "Side by side", kind: "matrix", slot: "body", hint: "Attributes compared across the options." },
    { key: "recommendation", label: "How to choose", kind: "callout", slot: "body", placeholder: "Less is often more — pick the sail you'll actually enjoy rigging and sailing." },
    { key: "ctaUrl", label: "Shop link (URL)", kind: "text", slot: "body", placeholder: "/hardware" },
    { key: "ctaLabel", label: "Button text", kind: "text", slot: "body", placeholder: "Shop the range" },
  ],
};

const SPOTGUIDE: BlogTemplate = {
  id: "spotguide",
  label: "Spotguide",
  shortLabel: "Spot",
  world: "experience",
  icon: "pin",
  tagline: "A destination guide — overall conditions, travel, family info & one or more spots.",
  cta: { defaultLabel: "See trips here" },
  fields: [
    // hero
    { key: "destinationName", label: "Destination", kind: "text", slot: "hero", placeholder: "Fuerteventura" },
    { key: "region", label: "Region / country", kind: "text", slot: "hero", placeholder: "Canary Islands, Spain" },
    // facts — destination at a glance
    { key: "bestSeason", label: "Best season", kind: "text", slot: "facts", factIcon: "sun", placeholder: "Year-round · peak May–Sep" },
    { key: "waterType", label: "Water", kind: "select", slot: "facts", factIcon: "wave", options: ["Flat water", "Choppy", "Waves", "Mixed"] },
    { key: "level", label: "Level", kind: "select", slot: "facts", factIcon: "gauge", options: ["Beginner", "Intermediate", "Advanced", "All levels"] },
    { key: "familyFriendly", label: "Family", kind: "select", slot: "facts", factIcon: "family", options: ["Very family-friendly", "Family-friendly", "Some family spots", "Better for adults"] },
    // body — destination general info, then the spots, then logistics
    { key: "overallConditions", label: "Overall conditions", kind: "textarea", slot: "body", placeholder: "What the wind and water are typically like across the destination…" },
    { key: "spots", label: "The spots", kind: "spots", slot: "body", hint: "One or more spots — each gets its own conditions, level, best wind, water & infrastructure." },
    { key: "gettingThere", label: "Getting there", kind: "textarea", slot: "body", placeholder: "Flights, ferries, transfers — how you reach the destination." },
    { key: "gettingAround", label: "Getting around", kind: "textarea", slot: "body", placeholder: "Car rental, public transport, how spread out the spots are." },
    { key: "infrastructure", label: "Infrastructure", kind: "textarea", slot: "body", placeholder: "Schools, rental, repair, shops, medical — what's on the ground." },
    { key: "familyInfo", label: "For families", kind: "textarea", slot: "body", placeholder: "Beaches, non-windsurf activities, which spots suit kids…" },
    { key: "whereToStay", label: "Where to stay & eat", kind: "list", slot: "body", listStyle: "bullet" },
    // cta
    { key: "ctaUrl", label: "Trips link (URL)", kind: "text", slot: "body", hint: "Link to the matching Experience / destination.", placeholder: "/destinations/fuerteventura" },
    { key: "ctaLabel", label: "Button text", kind: "text", slot: "body", placeholder: "See trips here" },
  ],
};

/**
 * Per-spot sub-schema for the `spots` field. The admin editor renders one
 * FieldEditor per entry inside each spot card; the public renderer reads these
 * keys to build a spot card. Categorised so the data stays consistent.
 */
export const SPOT_FIELDS: TemplateField[] = [
  { key: "name", label: "Spot name", kind: "text", slot: "body", placeholder: "Sotavento" },
  { key: "image", label: "Photo", kind: "image", slot: "body" },
  { key: "coords", label: "Map coordinates", kind: "text", slot: "body", hint: "Paste \"lat, lng\" from Google Maps (right-click the spot → copy the numbers).", placeholder: "28.0456, -14.3261" },
  { key: "level", label: "Level", kind: "select", slot: "body", options: ["Beginner", "Intermediate", "Advanced", "All levels"] },
  { key: "waterType", label: "Water (headline)", kind: "select", slot: "body", options: ["Flat water", "Choppy", "Waves", "Mixed"] },
  { key: "windWindow", label: "Wind window", kind: "windrose", slot: "body", hint: "Rate each wind direction for this spot." },
  { key: "conditionsAvail", label: "Conditions available", kind: "frequency", slot: "body", hint: "How often each condition shows up." },
  { key: "conditions", label: "Notes / conditions", kind: "textarea", slot: "body", placeholder: "What it's like on the water here…" },
  { key: "infrastructure", label: "Infrastructure", kind: "list", slot: "body", listStyle: "bullet", hint: "Tags: school, rental, bar, parking…" },
];

/* ----------------------------- spot sub-data ----------------------------- */

export const WIND_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type WindDir = (typeof WIND_DIRECTIONS)[number];
export type WindQuality = "best" | "good" | "no" | "";
export type WindWindow = Partial<Record<WindDir, WindQuality>>;

export const WIND_QUALITY_META: { id: Exclude<WindQuality, "">; label: string; color: string }[] = [
  { id: "best", label: "Best", color: "#1f9e57" },
  { id: "good", label: "Works", color: "#e0922a" },
  { id: "no", label: "No-go", color: "#cdd4d8" },
];

export function asWindWindow(v: unknown): WindWindow {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: WindWindow = {};
  for (const d of WIND_DIRECTIONS) {
    const q = o[d];
    if (q === "best" || q === "good" || q === "no") out[d] = q;
  }
  return out;
}
export function windWindowHasValue(w: WindWindow): boolean {
  return WIND_DIRECTIONS.some((d) => w[d]);
}
export function bestWinds(w: WindWindow): WindDir[] {
  return WIND_DIRECTIONS.filter((d) => w[d] === "best");
}

export const CONDITION_TYPES = [
  { key: "flat", label: "Flat water" },
  { key: "chop", label: "Chop" },
  { key: "waves", label: "Waves" },
] as const;
export type CondFreq = "often" | "sometimes" | "never" | "";
export type ConditionsAvail = Record<string, CondFreq>;

export function asConditionsAvail(v: unknown): ConditionsAvail {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: ConditionsAvail = {};
  for (const c of CONDITION_TYPES) {
    const f = o[c.key];
    if (f === "often" || f === "sometimes" || f === "never") out[c.key] = f;
  }
  return out;
}
export function conditionsAvailHasValue(c: ConditionsAvail): boolean {
  return CONDITION_TYPES.some((t) => c[t.key]);
}

/** Parse "lat, lng" (e.g. pasted from Google Maps) into numbers. */
export function parseCoords(v: string): { lat: number; lng: number } | null {
  const m = v.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/* ------------------------- comparison sub-data ------------------------- */

/** Per-option sub-schema for the `options` field (Comparison template). */
export const OPTION_FIELDS: TemplateField[] = [
  { key: "name", label: "Option name", kind: "text", slot: "body", placeholder: "Freeride" },
  { key: "image", label: "Photo", kind: "image", slot: "body" },
  { key: "bestFor", label: "Best for", kind: "text", slot: "body", placeholder: "Beginners to intermediates after easy speed" },
  { key: "pros", label: "Pros", kind: "list", slot: "body", listStyle: "check" },
  { key: "cons", label: "Cons", kind: "list", slot: "body", listStyle: "warn" },
];

export type Option = { name: string; image: string; bestFor: string; pros: string[]; cons: string[] };
export function asOptions(v: unknown): Option[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        name: asText(o.name),
        image: asText(o.image),
        bestFor: asText(o.bestFor),
        pros: asList(o.pros),
        cons: asList(o.cons),
      };
    })
    .filter((o) => o.name || o.bestFor || o.pros.length || o.cons.length);
}

/** A side-by-side comparison grid: column headers + attribute rows. */
export type MatrixRow = { label: string; values: string[] };
export type ComparisonMatrix = { columns: string[]; rows: MatrixRow[] };
export function asMatrix(v: unknown): ComparisonMatrix {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const columns = Array.isArray(o.columns) ? o.columns.map((c) => String(c ?? "")) : [];
  const rows = Array.isArray(o.rows)
    ? (o.rows as unknown[])
        .map((r) => {
          const rr = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return {
            label: asText(rr.label),
            values: Array.isArray(rr.values) ? rr.values.map((x) => String(x ?? "")) : [],
          };
        })
        .filter((r) => r.label || r.values.some((x) => x.trim()))
    : [];
  return { columns, rows };
}
export function matrixHasValue(m: ComparisonMatrix): boolean {
  return m.columns.length > 0 && m.rows.length > 0;
}

const TECHNIQUE_GUIDE: BlogTemplate = {
  id: "technique_guide",
  label: "Technique Guide",
  shortLabel: "Technique",
  world: "technique",
  icon: "academy",
  tagline: "Coach a skill step by step — prerequisites, steps, mistakes, a pro tip.",
  cta: { defaultLabel: "Train it on a trip" },
  fields: [
    { key: "skill", label: "Skill", kind: "text", slot: "hero", placeholder: "The carving jibe" },
    { key: "outcome", label: "What you'll learn", kind: "text", slot: "hero", hint: "The outcome, shown under the title.", placeholder: "Carry speed through the turn and plane out the other side." },
    { key: "discipline", label: "Discipline", kind: "select", slot: "facts", factIcon: "sail", options: ["Windsurf", "Wingfoil", "Foil"] },
    { key: "difficulty", label: "Difficulty", kind: "select", slot: "facts", factIcon: "gauge", options: ["Beginner", "Intermediate", "Advanced"] },
    { key: "timeToLearn", label: "Time to learn", kind: "text", slot: "facts", factIcon: "clock", placeholder: "A few sessions" },
    { key: "prerequisites", label: "Before you start", kind: "list", slot: "body", listStyle: "check", hint: "What you should already be able to do." },
    { key: "steps", label: "Step by step", kind: "steps", slot: "body" },
    { key: "mistakes", label: "Common mistakes", kind: "list", slot: "body", listStyle: "warn" },
    { key: "coachTip", label: "Coach's note", kind: "callout", slot: "body", placeholder: "Look where you want to go, not at your feet." },
    { key: "videoUrl", label: "Video", kind: "youtube", slot: "body", hint: "Optional YouTube link.", placeholder: "https://youtu.be/…" },
  ],
};

const MASTERCLASS: BlogTemplate = {
  id: "masterclass",
  label: "Masterclass",
  shortLabel: "Masterclass",
  world: "technique",
  icon: "academy",
  tagline: "A long-form, chaptered guide — a table of contents, chapters with their own intro, photo & points.",
  cta: { defaultLabel: "Level up on a trip" },
  fields: [
    { key: "skill", label: "Subject", kind: "text", slot: "hero", placeholder: "Freeride mastery" },
    { key: "outcome", label: "What you'll master", kind: "text", slot: "hero", hint: "The outcome, shown under the title.", placeholder: "More speed, better tuning, and a fully planing power jibe." },
    { key: "discipline", label: "Discipline", kind: "select", slot: "facts", factIcon: "sail", options: ["Windsurf", "Wingfoil", "Foil"] },
    { key: "difficulty", label: "Level", kind: "select", slot: "facts", factIcon: "gauge", options: ["Beginner", "Intermediate", "Advanced", "All levels"] },
    { key: "chapters", label: "Chapters", kind: "chapters", slot: "body", hint: "Each chapter gets a title, an intro, an optional photo and a list of points. A jump-to table of contents is built automatically." },
    { key: "ctaUrl", label: "CTA link (URL)", kind: "text", slot: "body", placeholder: "/experience#experiences" },
    { key: "ctaLabel", label: "CTA button text", kind: "text", slot: "body", placeholder: "Level up on a trip" },
  ],
};

export const BLOG_TEMPLATES: Record<BlogTemplateId, BlogTemplate> = {
  standard: STANDARD,
  equipment_review: EQUIPMENT_REVIEW,
  product_intro: PRODUCT_INTRO,
  gear_guide: GEAR_GUIDE,
  comparison: COMPARISON,
  spotguide: SPOTGUIDE,
  technique_guide: TECHNIQUE_GUIDE,
  masterclass: MASTERCLASS,
};

/** Templates an editor can pick, in display order (Article last). */
export const TEMPLATE_ORDER: BlogTemplateId[] = [
  "equipment_review",
  "product_intro",
  "gear_guide",
  "comparison",
  "spotguide",
  "technique_guide",
  "masterclass",
  "standard",
];

export function getTemplate(id: string | null | undefined): BlogTemplate {
  return BLOG_TEMPLATES[(id ?? "standard") as BlogTemplateId] ?? STANDARD;
}

export function fieldsForSlot(t: BlogTemplate, slot: FieldSlot): TemplateField[] {
  return t.fields.filter((f) => f.slot === slot);
}

/* --------------------------------------------------------------------------
 * World theming — keeps the neutral blog cohesive while tinting per world.
 * ------------------------------------------------------------------------ */

export type WorldTheme = {
  name: string; // overview filter label
  accent: string; // primary accent (chips, links, rules)
  accentInk: string; // text colour that reads on the accent
  deep: string; // deep background for hero/CTA
};

export const WORLD_THEME: Record<World, WorldTheme> = {
  experience: { name: "Travel", accent: "#00afdb", accentInk: "#00374a", deep: "#00374a" },
  hardware: { name: "Gear", accent: "#1f9e57", accentInk: "#06241a", deep: "#14241d" },
  technique: { name: "Technique", accent: "#f47b20", accentInk: "#3a1d05", deep: "#00374a" },
  both: { name: "NP7", accent: "#0aa3c7", accentInk: "#06283a", deep: "#10212b" },
};

export function worldTheme(world: string | null | undefined): WorldTheme {
  return WORLD_THEME[(world ?? "experience") as World] ?? WORLD_THEME.experience;
}

/** Default world for a template (editors can override per post). */
export function worldForTemplate(id: string | null | undefined): World {
  return getTemplate(id).world;
}

/* --------------------------------------------------------------------------
 * template_data accessors — tolerant readers used by the renderer.
 * ------------------------------------------------------------------------ */

export type TemplateData = Record<string, unknown>;

export function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
export function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}
export function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
}
export type Pair = { label: string; value: string };
export function asPairs(v: unknown): Pair[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ label: asText((x as Pair)?.label), value: asText((x as Pair)?.value) }))
    .filter((p) => p.label || p.value);
}
export type Feature = { title: string; description: string };
export function asFeatures(v: unknown): Feature[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ title: asText((x as Feature)?.title), description: asText((x as Feature)?.description) }))
    .filter((f) => f.title || f.description);
}
export type Step = { title: string; description: string; image?: string };
export function asSteps(v: unknown): Step[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({
      title: asText((x as Step)?.title),
      description: asText((x as Step)?.description),
      image: asText((x as Step)?.image),
    }))
    .filter((s) => s.title || s.description || s.image);
}
export type ProsCons = { pros: string[]; cons: string[] };
export function asProsCons(v: unknown): ProsCons {
  const o = (v && typeof v === "object" ? v : {}) as ProsCons;
  return { pros: asList(o.pros), cons: asList(o.cons) };
}
export type Spot = {
  name: string;
  image: string;
  coords: string;
  level: string;
  waterType: string;
  windWindow: WindWindow;
  conditionsAvail: ConditionsAvail;
  conditions: string;
  infrastructure: string[];
};
export function asSpots(v: unknown): Spot[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        name: asText(o.name),
        image: asText(o.image),
        coords: asText(o.coords),
        level: asText(o.level),
        waterType: asText(o.waterType),
        windWindow: asWindWindow(o.windWindow),
        conditionsAvail: asConditionsAvail(o.conditionsAvail),
        conditions: asText(o.conditions),
        infrastructure: asList(o.infrastructure),
      };
    })
    .filter((s) => s.name || s.conditions || s.image);
}

/** A chapter in a long-form Masterclass: heading + intro + photo + points. */
export type ChapterPoint = { title: string; description: string };
export type Chapter = { title: string; intro: string; image: string; points: ChapterPoint[] };
export function asChapters(v: unknown): Chapter[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const pts = Array.isArray(o.points)
        ? (o.points as unknown[])
            .map((p) => ({ title: asText((p as ChapterPoint)?.title), description: asText((p as ChapterPoint)?.description) }))
            .filter((p) => p.title || p.description)
        : [];
      return { title: asText(o.title), intro: asText(o.intro), image: asText(o.image), points: pts };
    })
    .filter((c) => c.title || c.intro || c.image || c.points.length);
}

/** True if a field actually has content worth rendering. */
export function fieldHasValue(field: TemplateField, data: TemplateData): boolean {
  const v = data[field.key];
  switch (field.kind) {
    case "rating":
      return asNumber(v) > 0;
    case "list":
      return asList(v).length > 0;
    case "pairs":
      return asPairs(v).length > 0;
    case "features":
      return asFeatures(v).length > 0;
    case "steps":
      return asSteps(v).length > 0;
    case "spots":
      return asSpots(v).length > 0;
    case "options":
      return asOptions(v).length > 0;
    case "matrix":
      return matrixHasValue(asMatrix(v));
    case "chapters":
      return asChapters(v).length > 0;
    case "windrose":
      return windWindowHasValue(asWindWindow(v));
    case "frequency":
      return conditionsAvailHasValue(asConditionsAvail(v));
    case "proscons": {
      const pc = asProsCons(v);
      return pc.pros.length > 0 || pc.cons.length > 0;
    }
    default:
      return asText(v).length > 0;
  }
}
