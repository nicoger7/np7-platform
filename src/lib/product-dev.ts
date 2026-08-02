/**
 * Product Development — the R&D build sheet (migration 129).
 *
 * Row types are hand-written here rather than pulled from database.types.ts:
 * that file is a stale generated snapshot (28 tables, no gen script) and
 * regenerating it would rewrite ~1700 lines and break the `Tables["x"]["Row"]`
 * aliases in src/lib/types.ts. Routes use `createAdminClient() as any` and cast
 * structurally at the use site, the same idiom as the hardware routes.
 *
 * This module also owns the FIELD CATALOGS — geometry per project kind, rating
 * axes per project kind. That is the deliberate line against key/value soup:
 * field *definitions* live in git and get reviewed in a PR, only *values* live
 * in jsonb. Same pattern as src/lib/blog-templates.ts owning template_data.
 */

// NOTE: this module is imported by CLIENT components (the ply editor needs the
// row types and the field catalogs), so it must stay free of server-only
// imports. The write guard that used to live here now sits in
// product-dev-api.ts, which only route handlers import — pulling
// `next/headers` in through this file breaks the production build.

// ─── Vocabularies (mirror the check constraints in migration 129) ────────────

export const PD_KINDS = ["fin", "board", "foil", "accessory"] as const;
export type PdKind = (typeof PD_KINDS)[number];

export const PD_STATUSES = ["concept", "in_development", "tooling", "pilot", "production", "shelved"] as const;
export type PdStatus = (typeof PD_STATUSES)[number];

export const PD_MOLD_KINDS = ["blade", "base", "shell", "insert", "trim_jig"] as const;
export const PD_MOLD_STATUSES = ["planned", "ordered", "in_use", "shipped", "retired"] as const;

export const PD_FIBRES = ["glass", "carbon", "aramid", "flax", "hybrid", "none"] as const;
export const PD_FORMS = ["prepreg", "dry_fabric", "forged", "resin", "core", "tape", "adhesive"] as const;
export const PD_WEAVES = ["plain", "twill", "uni", "biax", "triax", "chopped", "none"] as const;

export const PD_METHODS = ["cnc_cut", "prepreg_press", "wet_layup", "infusion", "bonding", "finishing", "qc"] as const;

export const PD_SOURCE_KINDS = ["email", "call", "whatsapp", "meeting", "datasheet", "test_report", "drawing", "quote"] as const;

/** How much weight a number carries. `varies_by_supplier` is the one that earns
 *  its place: a partner saying "these press parameters depend on your own
 *  prepreg supplier" becomes filterable data instead of a buried sentence. */
export const PD_CONFIDENCE = ["supplier_claim", "quoted", "confirmed", "measured", "estimate", "varies_by_supplier"] as const;
export type PdConfidence = (typeof PD_CONFIDENCE)[number];

export const PD_CONFIDENCE_LABELS: Record<PdConfidence, string> = {
  supplier_claim: "Supplier claim",
  quoted: "Quoted",
  confirmed: "Confirmed",
  measured: "Measured",
  estimate: "Estimate",
  varies_by_supplier: "Varies by supplier",
};

/** A parameter older than this wants re-confirming before it goes in a quote. */
export const STALE_SOURCE_MONTHS = 12;

// ─── Field catalogs ──────────────────────────────────────────────────────────

export type GeometryField = { key: string; label: string; unit?: string; step?: number };

/** What `pd_layups.geometry` holds, per project kind. Adding a board field is a
 *  one-line PR here, not a migration — but it is still typed, labelled and
 *  unit-carrying, which a free-form jsonb blob would not be. */
export const GEOMETRY_FIELDS: Record<PdKind, GeometryField[]> = {
  fin: [
    { key: "rake_deg", label: "Rake", unit: "°", step: 0.1 },
    { key: "back_end_mm", label: "Back end", unit: "mm", step: 0.5 },
    { key: "blade_length_cm", label: "Blade length", unit: "cm", step: 0.5 },
  ],
  board: [
    { key: "length_cm", label: "Length", unit: "cm", step: 0.5 },
    { key: "width_cm", label: "Width", unit: "cm", step: 0.1 },
    { key: "volume_l", label: "Volume", unit: "l", step: 1 },
    { key: "rocker_nose_mm", label: "Nose rocker", unit: "mm", step: 1 },
    { key: "rocker_tail_mm", label: "Tail rocker", unit: "mm", step: 1 },
    { key: "scoop_mm", label: "Scoop", unit: "mm", step: 1 },
    { key: "tail_width_cm", label: "Tail width", unit: "cm", step: 0.1 },
  ],
  foil: [
    { key: "span_cm", label: "Span", unit: "cm", step: 0.5 },
    { key: "area_cm2", label: "Area", unit: "cm²", step: 1 },
    { key: "aspect_ratio", label: "Aspect ratio", step: 0.1 },
  ],
  accessory: [],
};

export type RatingAxis = { key: string; label: string; hint?: string };

/** The axes a prototype is scored on in a test session (Phase 4). Kept beside
 *  GEOMETRY_FIELDS on purpose — same catalog-in-git rule. */
export const RATING_AXES: Record<PdKind, RatingAxis[]> = {
  fin: [
    { key: "upwind", label: "Upwind", hint: "Pointing angle and drive" },
    { key: "top_speed", label: "Top speed" },
    { key: "control", label: "Control", hint: "Overpowered and in chop" },
    { key: "lift", label: "Lift" },
    { key: "release", label: "Release", hint: "Off the fin through a jibe" },
    { key: "spinout", label: "Spin-out resistance" },
  ],
  board: [
    { key: "early_planing", label: "Early planing" },
    { key: "top_speed", label: "Top speed" },
    { key: "control", label: "Control" },
    { key: "jibing", label: "Jibing" },
    { key: "chop", label: "Chop handling" },
  ],
  foil: [
    { key: "takeoff", label: "Take-off" },
    { key: "glide", label: "Glide" },
    { key: "stability", label: "Stability" },
    { key: "turning", label: "Turning" },
  ],
  accessory: [],
};

// ─── jsonb shapes ────────────────────────────────────────────────────────────

/** An image under the scoped `product-dev/` storage root. `key` is a storage
 *  key, never a URL — the CDN base can change and these rows outlive it. */
export type PdPhoto = { key: string; caption?: string | null; w?: number | null; h?: number | null };

/** A design/CAD file on a layup: .s3d, .brd, .stp, .dxf … */
export type PdFile = { key: string; name: string; kind?: string | null };

/** A material used by a process step, with the quantity as the source worded it
 *  ("2 × 600 g") rather than a number we invented. */
export type PdStepMaterial = { material_id: string; qty_note?: string | null };

// ─── Row types ───────────────────────────────────────────────────────────────

export type PdProject = {
  id: string;
  name: string;
  slug: string;
  kind: PdKind;
  status: PdStatus;
  hw_product_id: string | null;
  summary: string | null;
  photos: PdPhoto[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdSource = {
  id: string;
  project_id: string | null;
  kind: (typeof PD_SOURCE_KINDS)[number];
  title: string;
  author_name: string | null;
  author_org: string | null;
  author_contact: string | null;
  recipient: string | null;
  received_at: string | null;
  body: string | null;
  confidence: PdConfidence;
  supplier_id: string | null;
  external_ref: string | null;
  files: PdFile[];
  photos: PdPhoto[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdConstruction = {
  id: string;
  project_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdMold = {
  id: string;
  project_id: string;
  name: string;
  kind: (typeof PD_MOLD_KINDS)[number];
  key_dimension_mm: number | null;
  key_dimension_label: string;
  plate_material: string | null;
  plate_thickness_mm: number | null;
  has_alignment_pins: boolean;
  supplier_id: string | null;
  holder_supplier_id: string | null;
  location_note: string | null;
  status: (typeof PD_MOLD_STATUSES)[number];
  photos: PdPhoto[];
  notes: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdMaterial = {
  id: string;
  slug: string;
  name: string;
  fibre: (typeof PD_FIBRES)[number];
  form: (typeof PD_FORMS)[number];
  weave: (typeof PD_WEAVES)[number] | null;
  gsm: number | null;
  default_orientation: string | null;
  diagram_color: string | null;
  supplier_id: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PdLayup = {
  id: string;
  project_id: string;
  construction_id: string;
  mold_id: string;
  name: string;
  ref: string | null;
  revision: number;
  superseded_by: string | null;
  is_reference: boolean;
  resin_pct_min: number | null;
  resin_pct_max: number | null;
  geometry: Record<string, number | string | null>;
  files: PdFile[];
  photos: PdPhoto[];
  notes: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdPly = {
  id: string;
  layup_id: string;
  ply_index: number;
  material_id: string;
  orientation: string | null;
  template_ref: string | null;
  length_cm: number | null;
  width_mm: number | null;
  stack: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** A sellable size of the program — rake and back end live HERE, not on the
 *  layup: the 37 TT and the 44 DTT run different geometry off the same stack. */
export type PdSize = {
  id: string;
  project_id: string;
  label: string;
  length_cm: number | null;
  box: string | null;
  rake_deg: number | null;
  back_end_mm: number | null;
  sort_order: number;
  notes: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PdProcess = {
  id: string;
  project_id: string;
  name: string;
  stage_order: number;
  method: (typeof PD_METHODS)[number];
  summary: string | null;
  construction_id: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdProcessStep = {
  id: string;
  process_id: string;
  step_no: number;
  title: string;
  body: string | null;
  equipment: string | null;
  temp_c_min: number | null;
  temp_c_max: number | null;
  pressure_t_min: number | null;
  pressure_t_max: number | null;
  duration_min: number | null;
  params: Record<string, unknown>;
  materials: PdStepMaterial[];
  critical: boolean;
  tolerance_target: number | null;
  tolerance_unit: string | null;
  tolerance_note: string | null;
  photos: PdPhoto[];
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** "8–10 t" / "120–130 °C" / "6" — a min/max pair where equal bounds collapse. */
export function fmtRange(min: number | null | undefined, max: number | null | undefined, unit = ""): string | null {
  if (min == null && max == null) return null;
  const suffix = unit ? ` ${unit}` : "";
  if (min != null && max != null) return min === max ? `${min}${suffix}` : `${min}–${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

/** 90 → "1 h 30", 360 → "6 h", 45 → "45 min". */
export function fmtDuration(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** The parameter strip under a process step: "8–10 t · 120–130 °C · 1 h 30". */
export function stepParams(step: Pick<PdProcessStep, "pressure_t_min" | "pressure_t_max" | "temp_c_min" | "temp_c_max" | "duration_min">): string[] {
  return [
    fmtRange(step.pressure_t_min, step.pressure_t_max, "t"),
    fmtRange(step.temp_c_min, step.temp_c_max, "°C"),
    fmtDuration(step.duration_min),
  ].filter((s): s is string => Boolean(s));
}

/**
 * "200 g/m² unidirectional carbon" → "Carbon UD 200".
 *
 * The full name is right in a dropdown and useless in a table cell — at column
 * width it truncates to "20", which is how the ply grid ended up looking like it
 * held quantities instead of materials.
 */
const WEAVE_SHORT: Record<string, string> = {
  plain: "plain", twill: "twill", uni: "UD", biax: "biax", triax: "triax", chopped: "chopped", none: "",
};

export function shortMaterialName(m: Pick<PdMaterial, "fibre" | "weave" | "gsm" | "form" | "name"> | undefined): string {
  if (!m) return "—";
  const fibre = m.fibre === "none" ? "" : m.fibre[0].toUpperCase() + m.fibre.slice(1);
  const weave = WEAVE_SHORT[m.weave ?? "none"] ?? "";
  const gsm = m.gsm ? String(m.gsm) : "";
  const dry = m.form === "dry_fabric" ? " dry" : "";
  const out = [fibre, weave, gsm].filter(Boolean).join(" ") + dry;
  return out.trim() || m.name;
}

/** What a ply's orientation actually is, following the material's default. */
export function plyOrientation(ply: Pick<PdPly, "orientation">, material: PdMaterial | undefined): { value: string; inherited: boolean } {
  if (ply.orientation) return { value: ply.orientation, inherited: false };
  return { value: material?.default_orientation ?? "—", inherited: true };
}

/** A source is stale once it is older than STALE_SOURCE_MONTHS — the dashboard
 *  lists these so provenance doesn't quietly decay into an optional field. */
export function isStaleSource(receivedAt: string | null | undefined, now = new Date()): boolean {
  if (!receivedAt) return false;
  const d = new Date(receivedAt);
  if (Number.isNaN(d.getTime())) return false;
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return months >= STALE_SOURCE_MONTHS;
}

/**
 * Group plies into their stacks in `ply_index` order.
 *
 * A blade's two sides (and a board's deck vs bottom) go into different mold
 * halves, so the ply lengths restart at each stack boundary. `stack` is the
 * column that records it; when it's null everything falls into one group rather
 * than the diagram guessing from the length sequence — a guess that breaks the
 * moment somebody edits a length.
 */
export function groupPliesByStack(plies: PdPly[]): { stack: string | null; plies: PdPly[] }[] {
  const ordered = [...plies].sort((a, b) => a.ply_index - b.ply_index);
  const out: { stack: string | null; plies: PdPly[] }[] = [];
  for (const p of ordered) {
    const last = out[out.length - 1];
    if (last && last.stack === (p.stack ?? null)) last.plies.push(p);
    else out.push({ stack: p.stack ?? null, plies: [p] });
  }
  return out;
}

