/**
 * The coaching graphic, as a document.
 *
 * The PLAN is the record and the PNG is a cache of it. A graphic has to be
 * re-openable in two years, and re-rendered after a brand tweak without anyone
 * redrawing it, which a flattened image cannot do.
 *
 * Note what is NOT in this file: colour, stroke width, font, opacity, z-order,
 * shadow. A mark says what it MEANS ("this is the error", "this is the rig")
 * and one renderer turns meaning into pixels. That is the whole consistency
 * guarantee: two graphics made a year apart run through byte-identical drawing
 * code and cannot diverge, where an image model re-samples the entire look on
 * every call. The day a styling field appears in this type, that guarantee is
 * gone.
 */

/**
 * Coordinates are PERMILLE INTEGERS of the frame: x 0..1000 left to right,
 * y 0..1000 top to bottom. Never pixels.
 *
 * The export renders at a different pixel size than the preview, and the video
 * burn-in runs after the resize in video-compress, so a pixel authored against
 * a 4K source would be wrong by half in a 1080p export. Integers additionally
 * cannot drift a decimal place, and the renderer clamps regardless.
 */
export type Pt = {
  x: number;
  y: number;
  /**
   * The reliability lever. Where the coach's own sketch gave us a named point,
   * the model names it here and the renderer substitutes the anchor's true
   * coordinates, discarding x and y. Naming is a task a model does well.
   * Pointing at a rider's back hand is not.
   */
  anchor: string | null;
};

/** WHAT the mark means. Never how it looks. */
export type Verdict =
  | "correct"   // being done right
  | "error"     // this is the mistake
  | "target"    // where it should be
  | "neutral";  // pointing only

/** What part of the picture it is about. */
export type Role = "body" | "rig" | "board" | "water" | "wind" | "gaze" | "force" | "travel";

export type MarkKind =
  | "arrow" | "path" | "highlight" | "spotlight"
  | "angle" | "guide" | "callout" | "step" | "redact";

export interface Mark {
  id: string;
  kind: MarkKind;
  verdict: Verdict;
  role: Role;
  /** At most TWO primaries per frame. The renderer demotes the rest. */
  emphasis: "primary" | "secondary";
  /** 1 = dropped first when the density cap bites, 5 = dropped last. */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Five words at most. The coach's own words beat a paraphrase. */
  label: string | null;
  /** A preference only; the renderer resolves the real position. */
  labelSide: "auto" | "up" | "down" | "left" | "right";

  from?: Pt;
  to?: Pt;
  /** Arrow curvature, permille of the chord. 0 is straight. */
  bend?: number;
  head?: "none" | "end" | "both";
  points?: Pt[];
  center?: Pt;
  /** Permille of the SHORT edge, so a circle stays a circle. */
  rx?: number;
  ry?: number;
  shape?: "ellipse" | "rect";
  vertex?: Pt;
  readout?: "none" | "measured";
  orientation?: "vertical" | "horizontal" | "through_points";
  extend?: "segment" | "full";
  at?: Pt;
  index?: number;
  /** Video only. Absent on a still. */
  keys?: { t: number; geom: Partial<Mark> }[];
}

export interface AnnotationPlan {
  v: 1;
  /** What this graphic teaches, one line, drawn as the caption strip. */
  caption: string | null;
  marks: Mark[];
  /** The model's own note when it could not do the job. Shown, never drawn. */
  note: string | null;
}

/** Named points the model may reference instead of guessing pixels. */
export type Anchor = { key: string; label: string; x: number; y: number; from: "sketch" | "pose" };

/* ───────────────────────── caps and normalisation ───────────────────────── */

/**
 * The density caps. Enforced HERE, in code, where no prompt can talk its way
 * past them. Six marks is already a busy frame and two confident marks beat
 * six correct ones; a graphic that looks busy looks amateur, which is the one
 * failure that would sink the whole tool.
 */
export const MAX_MARKS = 6;
export const MAX_PRIMARY = 2;
export const MAX_LABEL_WORDS = 5;

const KINDS: MarkKind[] = ["arrow", "path", "highlight", "spotlight", "angle", "guide", "callout", "step", "redact"];
const VERDICTS: Verdict[] = ["correct", "error", "target", "neutral"];
const ROLES: Role[] = ["body", "rig", "board", "water", "wind", "gaze", "force", "travel"];

const clampNum = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
};

function pt(raw: unknown, anchors: Map<string, Anchor>): Pt {
  const r = (raw ?? {}) as Partial<Pt>;
  const key = typeof r.anchor === "string" ? r.anchor : null;
  const a = key ? anchors.get(key) : undefined;
  // The anchor WINS. A named point the coach actually drew beats a coordinate
  // the model estimated, every time.
  if (a) return { x: clampNum(a.x, 0, 1000, 500), y: clampNum(a.y, 0, 1000, 500), anchor: key };
  return { x: clampNum(r.x, 0, 1000, 500), y: clampNum(r.y, 0, 1000, 500), anchor: key };
}

const trimLabel = (s: unknown): string | null => {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  return words.length <= MAX_LABEL_WORDS ? t : words.slice(0, MAX_LABEL_WORDS).join(" ");
};

/**
 * Take whatever the model returned and make it safe to draw.
 *
 * Everything the model can get wrong is corrected here rather than asked for
 * in the prompt: unknown kinds are dropped, coordinates are clamped, anchors
 * override coordinates, labels are cut to five words, the primary count is
 * demoted, and the mark count is trimmed by priority. A prompt is a request;
 * this is a guarantee.
 */
export function normalisePlan(raw: unknown, anchors: Anchor[] = []): AnnotationPlan {
  const byKey = new Map(anchors.map((a) => [a.key, a]));
  const r = (raw ?? {}) as Partial<AnnotationPlan>;

  let marks: Mark[] = (Array.isArray(r.marks) ? r.marks : [])
    .map((m, i): Mark | null => {
      const raw = (m ?? {}) as Partial<Mark>;
      const kind = KINDS.includes(raw.kind as MarkKind) ? (raw.kind as MarkKind) : null;
      if (!kind) return null;
      const out: Mark = {
        id: String(raw.id ?? `m${i + 1}`),
        kind,
        verdict: VERDICTS.includes(raw.verdict as Verdict) ? (raw.verdict as Verdict) : "neutral",
        role: ROLES.includes(raw.role as Role) ? (raw.role as Role) : "body",
        emphasis: raw.emphasis === "primary" ? "primary" : "secondary",
        priority: (clampNum(raw.priority, 1, 5, 3) as Mark["priority"]),
        label: trimLabel(raw.label),
        labelSide: (["auto", "up", "down", "left", "right"] as const).includes(raw.labelSide as never)
          ? (raw.labelSide as Mark["labelSide"]) : "auto",
      };
      if (raw.from) out.from = pt(raw.from, byKey);
      if (raw.to) out.to = pt(raw.to, byKey);
      if (raw.at) out.at = pt(raw.at, byKey);
      if (raw.center) out.center = pt(raw.center, byKey);
      if (raw.vertex) out.vertex = pt(raw.vertex, byKey);
      if (Array.isArray(raw.points)) out.points = raw.points.slice(0, 8).map((p) => pt(p, byKey));
      if (raw.bend != null) out.bend = clampNum(raw.bend, -100, 100, 0);
      if (raw.rx != null) out.rx = clampNum(raw.rx, 5, 500, 60);
      if (raw.ry != null) out.ry = clampNum(raw.ry, 5, 500, 60);
      if (raw.head) out.head = raw.head === "both" || raw.head === "none" ? raw.head : "end";
      if (raw.shape) out.shape = raw.shape === "rect" ? "rect" : "ellipse";
      if (raw.readout) out.readout = raw.readout === "measured" ? "measured" : "none";
      if (raw.orientation) out.orientation = raw.orientation;
      if (raw.extend) out.extend = raw.extend === "full" ? "full" : "segment";
      if (raw.index != null) out.index = clampNum(raw.index, 1, 9, 1);
      return out;
    })
    .filter((m): m is Mark => m !== null);

  // Trim by priority, then by original order: a stable rule, never randomness.
  if (marks.length > MAX_MARKS) {
    marks = marks
      .map((m, i) => ({ m, i }))
      .sort((a, b) => b.m.priority - a.m.priority || a.i - b.i)
      .slice(0, MAX_MARKS)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.m);
  }
  // Demote the extra primaries, keeping the highest priority ones loud.
  const primaries = marks.filter((m) => m.emphasis === "primary");
  if (primaries.length > MAX_PRIMARY) {
    const keep = new Set(
      [...primaries].sort((a, b) => b.priority - a.priority).slice(0, MAX_PRIMARY).map((m) => m.id)
    );
    marks = marks.map((m) => (m.emphasis === "primary" && !keep.has(m.id) ? { ...m, emphasis: "secondary" } : m));
  }

  return {
    v: 1,
    caption: typeof r.caption === "string" && r.caption.trim() ? r.caption.trim() : null,
    marks,
    note: typeof r.note === "string" && r.note.trim() ? r.note.trim() : null,
  };
}
