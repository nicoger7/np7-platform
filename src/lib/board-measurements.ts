/**
 * Board measurements — the shape half of Product Development (migration 238).
 *
 * What a board IS, as opposed to how it is built: the numbers you read off it
 * with a straightedge and a caliper, station by station. Shaping software
 * (Shape3d, AkuShaper — both already in this repo's file vocabulary) models a
 * board as three tables plus a set of slices, and this follows the same idea:
 * outline, rocker and thickness as station tables, the bottom shape as V,
 * concave and rail readings at the same stations, and a cross-section
 * reconstructed from the lot.
 *
 * VOCABULARY, because half of it is a false friend:
 *   scoop      the bend up at the NOSE end of the rocker line
 *   tail kick  the bend up at the TAIL end, behind the fin
 *   rocker     the whole line through both — one series, not three
 *   V          centreline lower in the water than the rails (an implied keel)
 *   inverted V rails lower than the centreline — the other sign of the same
 *              series, which is why V is stored signed and never split in two
 *
 * This module is imported by CLIENT components (the entry grid and the plan
 * both need the catalog), so it stays free of server-only imports — same rule
 * as src/lib/product-dev.ts.
 */

// ─── The metric catalog ──────────────────────────────────────────────────────
// Field DEFINITIONS live in git and get reviewed in a PR; only VALUES live in
// the database. Adding a metric is one line here, not a migration — the same
// line this section already draws for GEOMETRY_FIELDS in product-dev.ts.

export type BoardMetricKey =
  | "width" | "thickness" | "rocker" | "v" | "concave" | "rail_thickness" | "rail_shape";

export type BoardMetric = {
  key: BoardMetricKey;
  label: string;
  /** Default unit. A series may override it per board. */
  unit: "cm" | "mm";
  /** `choice` metrics carry a word in text_value and an optional number beside it. */
  kind: "number" | "choice";
  /** Negative readings are meaningful and get their own word. */
  signed?: boolean;
  negativeLabel?: string;
  positiveLabel?: string;
  /** Sub-kinds the series can declare (single vs double concave, and so on). */
  variants?: { key: string; label: string }[];
  choices?: { key: string; label: string }[];
  /** What the number beside a `choice` pick means. */
  numberLabel?: string;
  hint?: string;
  /** Drawing colour, consistent between the grid, the legend and the plan. */
  color: string;
};

export const BOARD_METRICS: BoardMetric[] = [
  {
    key: "width", label: "Width (bottom)", unit: "cm", kind: "number", color: "#38bdf8",
    hint: "Rail-edge to rail-edge across the flat bottom. Narrower than the board's overall max width, which lives on the board itself.",
  },
  {
    key: "thickness", label: "Thickness", unit: "cm", kind: "number", color: "#a78bfa",
    hint: "Bottom to deck at the centreline.",
  },
  {
    key: "rocker", label: "Rocker", unit: "mm", kind: "number", color: "#f59e0b",
    hint: "The scoop-rocker line off a straightedge on the bottom: tail kick at the tail end, scoop at the nose end, zero through the flat run.",
  },
  {
    key: "v", label: "V", unit: "mm", kind: "number", color: "#22c55e",
    signed: true, positiveLabel: "V", negativeLabel: "inverted V",
    variants: [
      { key: "mixed", label: "Inverted in the tail, V forward" },
      { key: "v", label: "V throughout" },
      { key: "inverted", label: "Inverted throughout" },
    ],
    hint: "Positive = V: the centreline sits lower than the rails. Negative = inverted V: the rails sit lower. One series through zero, so the crossover station is visible.",
  },
  {
    key: "concave", label: "Concave", unit: "mm", kind: "number", color: "#ec4899",
    signed: true, positiveLabel: "concave", negativeLabel: "convex",
    variants: [
      { key: "double", label: "Double" },
      { key: "single", label: "Single" },
      { key: "triple", label: "Triple" },
    ],
    hint: "Depth of the dish in the bottom. Say in the convention note what it was measured against — off the flat, or off the V.",
  },
  {
    key: "rail_thickness", label: "Rail thickness", unit: "mm", kind: "number", color: "#f97316",
    hint: "Thickness at the rail edge.",
  },
  {
    key: "rail_shape", label: "Rail shape", unit: "mm", kind: "choice", color: "#94a3b8",
    numberLabel: "Radius",
    choices: [
      { key: "hard", label: "Hard edge" },
      { key: "tucked", label: "Tucked under" },
      { key: "boxy", label: "Boxy" },
      { key: "soft", label: "Soft / round" },
      { key: "50_50", label: "50 / 50" },
      { key: "bevel", label: "Bevelled" },
      { key: "chined", label: "Chined" },
    ],
    hint: "The word, plus a radius if you measured one. There is no industry-standard vocabulary here, so the note field carries whatever the word misses.",
  },
];

export const BOARD_METRIC_BY_KEY: Record<string, BoardMetric> =
  Object.fromEntries(BOARD_METRICS.map((m) => [m.key, m]));

export const BOARD_CATEGORIES = ["slalom", "freerace", "freeride", "wave", "freestyle", "foil", "formula", "sup", "other"] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];

export const BOARD_ORIGINS = [
  { key: "own", label: "Our production board" },
  { key: "prototype", label: "Our prototype" },
  { key: "competitor", label: "Competitor board" },
  { key: "reference", label: "Reference / borrowed" },
] as const;
export type BoardOrigin = (typeof BOARD_ORIGINS)[number]["key"];

export const CUTOUT_KINDS = [
  { key: "tail_cutout", label: "Tail cut-out", hull: true },
  { key: "step", label: "Step", hull: true },
  { key: "channel", label: "Channel", hull: true },
  { key: "fin_box", label: "Fin box", hull: false },
  { key: "mast_track", label: "Mast track", hull: false },
  { key: "footstrap", label: "Footstrap insert", hull: false },
  { key: "vent", label: "Vent", hull: false },
  { key: "handle", label: "Handle", hull: false },
  { key: "other", label: "Other", hull: false },
] as const;
export type CutoutKind = (typeof CUTOUT_KINDS)[number]["key"];
export const CUTOUT_BY_KIND: Record<string, (typeof CUTOUT_KINDS)[number]> =
  Object.fromEntries(CUTOUT_KINDS.map((c) => [c.key, c]));

/** The station grid a new board starts with — every 10 cm from the tail. */
export const DEFAULT_STATIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180];

// ─── Row types ───────────────────────────────────────────────────────────────

export type BoardPhoto = { key: string; caption?: string | null; w?: number | null; h?: number | null };

export type PdBoard = {
  id: string;
  project_id: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: BoardCategory;
  origin: BoardOrigin;
  volume_l: number | null;
  length_cm: number | null;
  max_width_cm: number | null;
  tail_width_cm: number | null;
  weight_kg: number | null;
  construction: string | null;
  fin_box: string | null;
  station_origin: "tail" | "nose";
  station_unit: "cm" | "mm" | "in";
  stations: number[];
  measured_at: string | null;
  measured_by: string | null;
  summary: string | null;
  notes: string | null;
  photos: BoardPhoto[];
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PdBoardSeries = {
  board_id: string;
  metric: string;
  unit: string | null;
  variant: string | null;
  scale: number;
  relative_to: string | null;
  convention: string | null;
  enabled: boolean;
  sort_order: number;
  notes: string | null;
};

export type PdBoardPoint = {
  id: string;
  board_id: string;
  metric: string;
  station: number;
  value: number | null;
  text_value: string | null;
  note: string | null;
};

export type PdBoardCutout = {
  id: string;
  board_id: string;
  kind: CutoutKind;
  label: string | null;
  station_from: number | null;
  station_to: number | null;
  offset_cm: number | null;
  mirrored: boolean;
  width_cm: number | null;
  depth_mm: number | null;
  angle_deg: number | null;
  spec: string | null;
  notes: string | null;
  sort_order: number;
};

export type PdBoardNote = {
  id: string;
  board_id: string;
  kind: "text" | "voice";
  body: string | null;
  audio_key: string | null;
  duration_s: number | null;
  status: "raw" | "sorted" | "applied" | "discarded";
  filed: FiledNote;
  created_at: string;
  updated_at: string;
};

/** What the sorter made of a raw note. Always a PROPOSAL — importing it is a
 *  separate, human press of a button. */
export type FiledNote = {
  summary?: string;
  bullets?: string[];
  /** Measurements it believes it read, in the same shape the importer takes. */
  proposals?: ParsedSeries[];
  /** Board-level fields it believes it read — never written automatically. */
  board?: Record<string, string | number | null>;
  error?: string;
  sortedAt?: string;
  by?: "parser" | "model";
};

// ─── Units ───────────────────────────────────────────────────────────────────

export function metricUnit(metric: string, series?: Pick<PdBoardSeries, "unit"> | null): string {
  return series?.unit || BOARD_METRIC_BY_KEY[metric]?.unit || "mm";
}

/** Everything the drawing does happens in millimetres. */
export function toMm(value: number, unit: string): number {
  if (unit === "cm") return value * 10;
  if (unit === "in") return value * 25.4;
  return value;
}

/** The reading as it should be READ, scale applied. Never stored back — the
 *  point row keeps what the tape said. */
export function effectiveValue(point: Pick<PdBoardPoint, "value">, series?: Pick<PdBoardSeries, "scale"> | null): number | null {
  if (point.value == null) return null;
  const scale = series?.scale;
  return scale == null || scale === 1 ? point.value : point.value * scale;
}

/** Format a signed reading with the word its sign means: "2.1 mm inverted V". */
export function fmtReading(metric: string, value: number | null, unit: string): string {
  if (value == null) return "—";
  const m = BOARD_METRIC_BY_KEY[metric];
  const n = `${Math.abs(value)} ${unit}`;
  if (!m?.signed || value === 0) return value === 0 ? `0 ${unit}` : n;
  return `${n} ${value < 0 ? m.negativeLabel : m.positiveLabel}`;
}

// ─── Derived readouts ────────────────────────────────────────────────────────

export type SeriesPoints = { station: number; value: number }[];

/** The points of one metric, scale applied, in station order, values only. */
export function seriesPoints(points: PdBoardPoint[], metric: string, series?: PdBoardSeries | null): SeriesPoints {
  return points
    .filter((p) => p.metric === metric && p.value != null)
    .map((p) => ({ station: p.station, value: effectiveValue(p, series) as number }))
    .sort((a, b) => a.station - b.station);
}

export type RockerReadout = {
  scoop: { station: number; value: number } | null;
  tailKick: { station: number; value: number } | null;
  flatFrom: number | null;
  flatTo: number | null;
  /** Where the curve leaves the flat — from a "start" marker if one was
   *  written down, otherwise the last zero reading. */
  riseFrom: number | null;
  riseFromMarker: boolean;
};

/** A word reading that marks where the rocker begins: "80 - start". */
export function riseMarkerStation(points: Pick<PdBoardPoint, "metric" | "station" | "text_value" | "note">[], metric = "rocker"): number | null {
  const hit = points
    .filter((p) => p.metric === metric && /^(start|beginn|anfang|kick|rise)/i.test((p.text_value ?? p.note ?? "").trim()))
    .sort((a, b) => a.station - b.station)[0];
  return hit ? hit.station : null;
}

/**
 * Split a rocker line into its two ends.
 *
 * The line is read off a straightedge, so both ends rise from a flat run in the
 * middle. Whichever end is the nose depends on station_origin — get that wrong
 * and the readout calls the scoop a tail kick, which is the one mistake a
 * shaper would notice instantly.
 *
 * `marker` is the reason this takes a third argument. A session often records
 * where the rocker STARTS as a word rather than a number ("80 - start"), and
 * without it the readout reports the flat run ending at the last zero it can
 * see — 50 on a board that is flat to 80. Both facts are kept separate rather
 * than averaged into one: `flatTo` is what was measured, `riseFrom` is what
 * was observed.
 */
export function rockerReadout(pts: SeriesPoints, stationOrigin: "tail" | "nose", marker?: number | null): RockerReadout {
  if (!pts.length) {
    return { scoop: null, tailKick: null, flatFrom: null, flatTo: null, riseFrom: marker ?? null, riseFromMarker: marker != null };
  }
  const flat = pts.filter((p) => p.value === 0);
  const low = pts[0];
  const high = pts[pts.length - 1];
  // Low station = the origin end. Origin 'tail' → low is the tail.
  const tailEnd = stationOrigin === "tail" ? low : high;
  const noseEnd = stationOrigin === "tail" ? high : low;
  const flatTo = flat.length ? flat[flat.length - 1].station : null;
  return {
    scoop: noseEnd.value > 0 ? noseEnd : null,
    tailKick: tailEnd.value > 0 ? tailEnd : null,
    flatFrom: flat.length ? flat[0].station : null,
    flatTo,
    riseFrom: marker ?? flatTo,
    riseFromMarker: marker != null,
  };
}

/** Where a signed series crosses zero, interpolated. The V crossover is the
 *  number a shaper asks for first. */
export function zeroCrossing(pts: SeriesPoints): number | null {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.value === 0) return a.station;
    if ((a.value < 0 && b.value > 0) || (a.value > 0 && b.value < 0)) {
      const t = Math.abs(a.value) / (Math.abs(a.value) + Math.abs(b.value));
      return round(a.station + t * (b.station - a.station), 1);
    }
  }
  const zero = pts.find((p) => p.value === 0);
  return zero ? zero.station : null;
}

export function widestPoint(pts: SeriesPoints): { station: number; value: number } | null {
  if (!pts.length) return null;
  return pts.reduce((best, p) => (p.value > best.value ? p : best), pts[0]);
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ─── Interpolation ───────────────────────────────────────────────────────────

/**
 * Fritsch-Carlson monotone cubic tangents.
 *
 * A plain Catmull-Rom through measured points overshoots wherever the spacing
 * is uneven — and this data is deliberately uneven (every 10 cm through the
 * middle, every 20 at the ends). Overshoot would draw a hump in the outline
 * that nobody measured, i.e. it would invent shape. Monotone cubic cannot:
 * between two readings it stays between them.
 */
function monotoneTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  if (n < 2) return new Array(n).fill(0);
  const dx: number[] = [], dy: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    dy.push(ys[i + 1] - ys[i]);
    slope.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  return m;
}

/** Sample the monotone curve through `pts` at `x`. Clamps outside the data —
 *  it will not extrapolate a nose that was never measured. */
export function interpolate(pts: SeriesPoints, x: number): number | null {
  if (!pts.length) return null;
  if (pts.length === 1) return pts[0].value;
  if (x <= pts[0].station) return pts[0].value;
  if (x >= pts[pts.length - 1].station) return pts[pts.length - 1].value;
  const xs = pts.map((p) => p.station), ys = pts.map((p) => p.value);
  const m = monotoneTangents(xs, ys);
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const t = (x - xs[i]) / h;
  const t2 = t * t, t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * m[i + 1]
  );
}

/** An SVG path through the points, monotone-smoothed, in screen coordinates. */
export function smoothPath(pts: SeriesPoints, toX: (station: number) => number, toY: (value: number) => number, samples = 6): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${toX(pts[0].station)} ${toY(pts[0].value)}`;
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (i === 0) out.push(`M ${toX(a.station)} ${toY(a.value)}`);
    for (let s = 1; s <= samples; s++) {
      const x = a.station + ((b.station - a.station) * s) / samples;
      const y = interpolate(pts, x);
      if (y != null) out.push(`L ${toX(x)} ${toY(y)}`);
    }
  }
  return out.join(" ");
}

// ─── The paste parser ────────────────────────────────────────────────────────
/**
 * Read a measuring session straight out of the notes app it was typed into.
 *
 * This is not a convenience wrapper on a form — it IS the entry path. The
 * format below is what a measuring session actually looks like when your hands
 * are wet: a metric heading, then a station per line, then whatever number you
 * got, with the units and the caveats written in as prose.
 *
 *   Rocker
 *   10 - 0
 *   20
 *   80 - start
 *   110 - 4.5mm
 *
 *   V - inverted!! (Alles halbieren)
 *   10 0.2mm
 *   80 - 0
 *   Normal V from here
 *   90 - 2.9mm
 *
 * Three things it does that a naive split would not:
 *   * A station with NO reading is kept. "20" on its own is a point you meant
 *     to measure and didn't — losing it loses the to-do.
 *   * A bare directive line ("Normal V from here") flips the sign of every
 *     reading after it and is recorded as the note on the first one, so the
 *     crossover keeps its provenance instead of becoming an unexplained
 *     minus sign.
 *   * Caveats in the heading ("Alles halbieren", "minus the inverted V") are
 *     never acted on silently. They come back as `suggestions` the importer
 *     shows as tick-boxes.
 */

export type ParsedPoint = {
  station: number;
  value: number | null;
  unit: string | null;
  text: string | null;
  note: string | null;
};

export type ParsedSeries = {
  metric: BoardMetricKey;
  heading: string;
  variant: string | null;
  convention: string | null;
  unit: string | null;
  points: ParsedPoint[];
  /** Mechanical readings of the heading's prose, for the importer to confirm. */
  suggestions: { kind: "scale" | "relative_to" | "variant"; value: string | number; because: string }[];
};

export type ParseResult = {
  series: ParsedSeries[];
  /** Lines that matched nothing. Shown, never swallowed. */
  ignored: string[];
  warnings: string[];
};

/** Heading synonyms → metric. Longest match wins, so "rail thickness" beats
 *  "thickness" and "double concave" beats "concave". */
const HEADING_PATTERNS: { re: RegExp; metric: BoardMetricKey; variant?: string }[] = [
  { re: /\brail\s*(thickness|dicke)\b/i, metric: "rail_thickness" },
  { re: /\brail\s*(shape|form)\b/i, metric: "rail_shape" },
  { re: /\bdouble\s*concave\b/i, metric: "concave", variant: "double" },
  { re: /\btriple\s*concave\b/i, metric: "concave", variant: "triple" },
  { re: /\bsingle\s*concave\b/i, metric: "concave", variant: "single" },
  { re: /\bconcave\b/i, metric: "concave" },
  { re: /\b(width|breite)\b/i, metric: "width" },
  { re: /\b(thickness|dicke)\b/i, metric: "thickness" },
  { re: /\b(rocker|scoop|tail\s*kick|tailkick)\b/i, metric: "rocker" },
  { re: /^\s*v\b|\bvee\b|\bv[- ]?shape\b/i, metric: "v" },
];

function matchHeading(line: string): { metric: BoardMetricKey; variant?: string } | null {
  // A line carrying a station reading is data, never a heading: "10 - 0.2mm"
  // contains no heading word, but "V - inverted" must not be eaten by the
  // number branch either. Headings are lines that do NOT start with a number.
  if (/^\s*[-–—]?\s*\d/.test(line)) return null;
  for (const p of HEADING_PATTERNS) if (p.re.test(line)) return { metric: p.metric, variant: p.variant };
  return null;
}

/** "1,5mm" / "13.8 cm" / "4.5mm" / "2mm)" → { value, unit }. */
function readNumber(raw: string): { value: number; unit: string | null; rest: string } | null {
  const m = raw.match(/^\s*([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|")?\s*(.*)$/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const unit = m[2] ? m[2].toLowerCase().replace('"', "in") : null;
  return { value, unit: unit === "m" ? "mm" : unit, rest: m[3] ?? "" };
}

const DIRECTIVE_INVERTED = /\b(invert|inverted|umgekehrt|negativ)/i;
const DIRECTIVE_NORMAL = /\b(normal|positiv|regular)\b/i;

export function parseMeasurementText(input: string): ParseResult {
  const series: ParsedSeries[] = [];
  const ignored: string[] = [];
  const warnings: string[] = [];
  let current: ParsedSeries | null = null;
  let sign = 1;
  let pendingNote: string | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = matchHeading(line);
    if (heading) {
      const metric = BOARD_METRIC_BY_KEY[heading.metric];
      const suggestions: ParsedSeries["suggestions"] = [];
      // Everything after the metric word is the shaper's caveat. Kept verbatim.
      const convention = line.replace(/^[^a-zA-ZäöüÄÖÜ]*/, "").trim();
      let variant = heading.variant ?? null;

      if (/halbier|halve|half\b|\/\s*2\b/i.test(line)) {
        suggestions.push({ kind: "scale", value: 0.5, because: "the heading says to halve the readings" });
      }
      if (DIRECTIVE_INVERTED.test(line)) {
        sign = -1;
        if (heading.metric === "v") variant = variant ?? "mixed";
        suggestions.push({ kind: "variant", value: variant ?? "inverted", because: "the heading says inverted" });
      } else {
        sign = 1;
      }
      const rel = line.match(/(?:minus|ohne|without|minus the)\s+(?:the\s+)?(inverted\s+v|v|concave|rocker)/i);
      if (rel) {
        suggestions.push({ kind: "relative_to", value: /v/i.test(rel[1]) ? "v" : rel[1].toLowerCase(), because: `the heading says "${rel[0]}"` });
      }

      current = {
        metric: heading.metric,
        heading: line,
        variant,
        convention: convention !== metric?.label ? convention : null,
        unit: null,
        points: [],
        suggestions,
      };
      series.push(current);
      pendingNote = null;
      continue;
    }

    // A directive: no leading station, but it changes how the rest is read.
    if (!/^\s*\d/.test(line)) {
      if (current && (DIRECTIVE_INVERTED.test(line) || DIRECTIVE_NORMAL.test(line))) {
        sign = DIRECTIVE_INVERTED.test(line) ? -1 : 1;
        pendingNote = line;
        continue;
      }
      ignored.push(line);
      continue;
    }

    if (!current) {
      ignored.push(line);
      warnings.push(`"${line}" came before any heading, so there is no metric to file it under.`);
      continue;
    }

    // station [separator] rest
    const m = line.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:[-–—:=]\s*)?(.*)$/);
    if (!m) { ignored.push(line); continue; }
    const station = parseFloat(m[1].replace(",", "."));
    const rest = (m[2] ?? "").trim();

    // Anything in brackets is the shaper talking, not a reading.
    const bracket = rest.match(/\(([^)]*)\)/);
    const body = rest.replace(/\([^)]*\)/g, "").trim();
    let note = bracket ? bracket[1].trim() : null;
    if (pendingNote) { note = note ? `${pendingNote} · ${note}` : pendingNote; pendingNote = null; }

    if (!body) {
      current.points.push({ station, value: null, unit: null, text: null, note });
      continue;
    }

    const num = readNumber(body);
    if (num) {
      // Trailing junk after a number ("1.5mma") is a typo, not a second field.
      const trailing = num.rest.trim();
      if (trailing && trailing.length > 2) note = note ? `${trailing} · ${note}` : trailing;
      if (num.unit && !current.unit) current.unit = num.unit;
      if (num.unit && current.unit && num.unit !== current.unit) {
        warnings.push(`${current.heading}: station ${station} is in ${num.unit} but the series is in ${current.unit}.`);
      }
      current.points.push({ station, value: num.value === 0 ? 0 : sign * num.value, unit: num.unit, text: null, note });
      continue;
    }

    // A word instead of a number: "start", "flat", a rail-shape pick.
    current.points.push({ station, value: null, unit: null, text: body, note });
  }

  for (const s of series) {
    if (!s.points.length) warnings.push(`"${s.heading}" has no readings under it.`);
  }
  return { series, ignored, warnings };
}

/** A one-line summary of what an import will do, for the confirm step. */
export function describeParse(result: ParseResult): string {
  const points = result.series.reduce((n, s) => n + s.points.filter((p) => p.value != null || p.text).length, 0);
  const blanks = result.series.reduce((n, s) => n + s.points.filter((p) => p.value == null && !p.text).length, 0);
  const parts = [`${result.series.length} metric${result.series.length === 1 ? "" : "s"}`, `${points} reading${points === 1 ? "" : "s"}`];
  if (blanks) parts.push(`${blanks} station${blanks === 1 ? "" : "s"} still to measure`);
  return parts.join(" · ");
}
