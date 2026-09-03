import type { AnnotationPlan, Mark, Pt, Verdict } from "@/lib/annotation-plan";

/**
 * The one place a coaching graphic becomes pixels.
 *
 * Pure: no React, no hooks, no window beyond one offscreen canvas, exactly as
 * promo-render.ts is. It serves the live preview, the PNG export and later the
 * per-frame video burn-in, and that is the whole point. The day a second draw
 * path appears the consistency promise is gone, and it will go silently. This
 * repo has already fought that fight once and wrote the reasoning down in
 * promo-insert.tsx.
 *
 * It runs in the BROWSER only, for three reasons that are checkable rather than
 * aesthetic. Vercel's serverless runtime has no system fonts and its image
 * build ignores @font-face, which is why every glyph on the share card is a
 * vector path. The team is on a Vercel plan that has already hit the Fluid CPU
 * cap and auto-paused. And a server twin would be that second renderer.
 */

/* ── The frozen style table. Literals, not CSS variables: Canvas cannot read
      custom properties, and promo-render.ts hardcodes for the same reason.
      Values from globals.css. ─────────────────────────────────────────────── */
const OCEAN = "#00afdb";
const OCEAN_DEEP = "#00374a";
const SUN = "#ffc42e";
const CORAL = "#f47b20";

const VERDICT_COLOR: Record<Verdict, string> = {
  correct: OCEAN,
  error: CORAL,
  target: SUN,
  neutral: "#ffffff",
};
/** "Where it should be" is the one thing that is not there yet, so it is dashed. */
const VERDICT_DASH: Record<Verdict, number[]> = {
  correct: [], error: [], target: [14, 10], neutral: [],
};

export type HitBox = { id: string; x: number; y: number; w: number; h: number };

const px = (p: Pt, W: number, H: number) => ({ x: (p.x / 1000) * W, y: (p.y / 1000) * H });

/**
 * Every stroke is drawn TWICE: a dark halo, then the colour.
 *
 * This is the single craft detail that decides whether the result looks
 * professional. It is the lesson of the broadcast first-down line: the mark has
 * to read as part of the picture. Without it a cyan arrow dies in white spray
 * and a coral one dies in a sunset, which is most of what NP7 photographs.
 */
function stroked(
  ctx: CanvasRenderingContext2D,
  width: number,
  color: string,
  dash: number[],
  S: number,
  path: () => void,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash.map((d) => d * S));
  ctx.strokeStyle = "rgba(0,55,74,0.45)";
  ctx.lineWidth = width * 2.2;
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  path();
  ctx.stroke();
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const back = -size, half = size * 0.52;
  const draw = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(back, -half);
    ctx.lineTo(back * 0.72, 0);
    ctx.lineTo(back, half);
    ctx.closePath();
  };
  ctx.fillStyle = "rgba(0,55,74,0.45)";
  ctx.save(); ctx.scale(1.22, 1.22); draw(); ctx.fill(); ctx.restore();
  ctx.fillStyle = color;
  draw();
  ctx.fill();
  ctx.restore();
}

/** A quadratic whose control point sits `bend` permille off the chord's middle. */
function bentPath(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = (bend / 1000) * len;
  const cx = mx + (-dy / len) * off, cy = my + (dx / len) * off;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cx, cy, b.x, b.y);
  return { cx, cy };
}

/**
 * Labels are the only thing whose position is computed rather than given.
 *
 * The solver is deterministic on purpose: it walks marks in a fixed order, uses
 * the preferred side, then the other three, then pushes out in fixed steps, and
 * never consults randomness or object iteration order. Same plan and same font
 * metrics means the same result, which is what makes the consistency claim
 * testable rather than a hope.
 */
function placeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchor: { x: number; y: number },
  side: Mark["labelSide"],
  taken: HitBox[],
  S: number,
  W: number, H: number,
): { x: number; y: number; w: number; h: number } {
  const padX = 12 * S, padY = 8 * S;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 34 * S;
  const gap = 18 * S;
  const order = side === "auto" ? ["up", "right", "down", "left"] : [side, "up", "right", "down", "left"];
  const overlaps = (b: { x: number; y: number; w: number; h: number }) =>
    taken.some((t) => !(b.x + b.w < t.x || t.x + t.w < b.x || b.y + b.h < t.y || t.y + t.h < b.y));

  for (let push = 0; push < 6; push++) {
    for (const s of order) {
      const d = gap + push * 12 * S;
      const box = { w, h,
        x: s === "left" ? anchor.x - w - d : s === "right" ? anchor.x + d : anchor.x - w / 2,
        y: s === "up" ? anchor.y - h - d : s === "down" ? anchor.y + d : anchor.y - h / 2 };
      box.x = Math.min(W - w - 8 * S, Math.max(8 * S, box.x));
      box.y = Math.min(H - h - 8 * S, Math.max(8 * S, box.y));
      if (!overlaps(box)) return box;
    }
  }
  return { x: Math.min(W - w - 8 * S, Math.max(8 * S, anchor.x - w / 2)), y: Math.max(8 * S, anchor.y - h - gap), w, h };
}

function chip(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, text: string, color: string, S: number, primary: boolean) {
  ctx.save();
  const r = 10 * S;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, r);
  ctx.fillStyle = primary ? color : "rgba(0,55,74,0.82)";
  ctx.fill();
  if (!primary) { ctx.strokeStyle = color; ctx.lineWidth = 2 * S; ctx.stroke(); }
  ctx.fillStyle = primary && color === SUN ? OCEAN_DEEP : "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, box.x + 12 * S, box.y + box.h / 2 + 0.5 * S);
  ctx.restore();
}

export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  plan: AnnotationPlan,
  photo: CanvasImageSource | null,
  W: number,
  H: number,
  opts?: { selectedId?: string | null },
): HitBox[] {
  /* One scale for everything. Stroke widths, arrowheads, label size, radii and
     the halo are all a constant times S, so a 1080px export and a 2160px export
     are the same picture rather than the same picture with thinner lines. */
  const S = Math.min(W, H) / 1000;
  const hits: HitBox[] = [];
  const labelBoxes: HitBox[] = [];

  ctx.clearRect(0, 0, W, H);
  if (photo) ctx.drawImage(photo, 0, 0, W, H);

  // Dimming first, so every mark sits on top of it.
  const spots = plan.marks.filter((m) => m.kind === "spotlight" && m.center);
  if (spots.length) {
    ctx.save();
    ctx.fillStyle = "rgba(0,55,74,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (const m of spots) {
      const c = px(m.center!, W, H);
      const rx = ((m.rx ?? 90) / 1000) * Math.min(W, H);
      const ry = ((m.ry ?? m.rx ?? 90) / 1000) * Math.min(W, H);
      ctx.moveTo(c.x + rx, c.y);
      ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2, true);
    }
    ctx.fill("evenodd");
    ctx.restore();
  }

  for (const m of plan.marks) {
    const primary = m.emphasis === "primary";
    const color = VERDICT_COLOR[m.verdict];
    const dash = VERDICT_DASH[m.verdict];
    const w = (primary ? 9 : 6) * S;
    const sel = opts?.selectedId === m.id;
    let labelAt: { x: number; y: number } | null = null;

    if (m.kind === "arrow" && m.from && m.to) {
      const a = px(m.from, W, H), b = px(m.to, W, H);
      const bend = m.bend ?? 0;
      const ctrl = { cx: 0, cy: 0 };
      stroked(ctx, w, color, dash, S, () => { Object.assign(ctrl, bentPath(ctx, a, b, bend)); });
      const ang = Math.atan2(b.y - (bend ? ctrl.cy : a.y), b.x - (bend ? ctrl.cx : a.x));
      if (m.head !== "none") arrowHead(ctx, b.x, b.y, ang, (primary ? 34 : 26) * S, color);
      if (m.head === "both") arrowHead(ctx, a.x, a.y, ang + Math.PI, (primary ? 34 : 26) * S, color);
      labelAt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      hits.push({ id: m.id, x: Math.min(a.x, b.x) - w, y: Math.min(a.y, b.y) - w, w: Math.abs(b.x - a.x) + w * 2, h: Math.abs(b.y - a.y) + w * 2 });
    } else if (m.kind === "path" && m.points && m.points.length >= 2) {
      const ps = m.points.map((p) => px(p, W, H));
      stroked(ctx, w, color, dash, S, () => {
        ctx.beginPath();
        ctx.moveTo(ps[0].x, ps[0].y);
        // Catmull-Rom-ish smoothing: a traced line of travel should look like
        // travel, not like a survey.
        for (let i = 1; i < ps.length; i++) {
          const p0 = ps[i - 1], p1 = ps[i];
          ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        }
        ctx.lineTo(ps[ps.length - 1].x, ps[ps.length - 1].y);
      });
      const last = ps[ps.length - 1], prev = ps[ps.length - 2];
      if (m.head !== "none") arrowHead(ctx, last.x, last.y, Math.atan2(last.y - prev.y, last.x - prev.x), (primary ? 32 : 24) * S, color);
      labelAt = ps[Math.floor(ps.length / 2)];
      const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
      hits.push({ id: m.id, x: Math.min(...xs) - w, y: Math.min(...ys) - w, w: Math.max(...xs) - Math.min(...xs) + w * 2, h: Math.max(...ys) - Math.min(...ys) + w * 2 });
    } else if ((m.kind === "highlight" || m.kind === "spotlight" || m.kind === "redact") && m.center) {
      const c = px(m.center, W, H);
      const rx = ((m.rx ?? 90) / 1000) * Math.min(W, H);
      const ry = ((m.ry ?? m.rx ?? 90) / 1000) * Math.min(W, H);
      if (m.kind === "redact") {
        ctx.save();
        ctx.fillStyle = OCEAN_DEEP;
        ctx.beginPath();
        ctx.roundRect(c.x - rx, c.y - ry, rx * 2, ry * 2, 8 * S);
        ctx.fill();
        ctx.restore();
      } else {
        stroked(ctx, w, color, dash, S, () => {
          ctx.beginPath();
          if (m.shape === "rect") ctx.roundRect(c.x - rx, c.y - ry, rx * 2, ry * 2, 14 * S);
          else ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
        });
      }
      labelAt = { x: c.x, y: c.y - ry };
      hits.push({ id: m.id, x: c.x - rx - w, y: c.y - ry - w, w: rx * 2 + w * 2, h: ry * 2 + w * 2 });
    } else if (m.kind === "angle" && m.vertex && m.from && m.to) {
      const v = px(m.vertex, W, H), a = px(m.from, W, H), b = px(m.to, W, H);
      const r = Math.min(Math.hypot(a.x - v.x, a.y - v.y), Math.hypot(b.x - v.x, b.y - v.y)) * 0.42;
      const a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(b.y - v.y, b.x - v.x);
      stroked(ctx, w, color, dash, S, () => {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(v.x, v.y); ctx.lineTo(b.x, b.y);
      });
      stroked(ctx, w * 0.7, color, [], S, () => {
        ctx.beginPath(); ctx.arc(v.x, v.y, r, a1, a2);
      });
      labelAt = { x: v.x + Math.cos((a1 + a2) / 2) * r * 1.7, y: v.y + Math.sin((a1 + a2) / 2) * r * 1.7 };
      hits.push({ id: m.id, x: v.x - r, y: v.y - r, w: r * 2, h: r * 2 });
    } else if (m.kind === "guide" && m.from) {
      const a = px(m.from, W, H);
      const b = m.to ? px(m.to, W, H) : { x: a.x, y: H };
      const full = m.extend === "full";
      const p1 = full ? { x: m.orientation === "horizontal" ? 0 : a.x, y: m.orientation === "horizontal" ? a.y : 0 } : a;
      const p2 = full ? { x: m.orientation === "horizontal" ? W : a.x, y: m.orientation === "horizontal" ? a.y : H } : b;
      stroked(ctx, w * 0.7, color, [10, 9], S, () => {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      });
      labelAt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      hits.push({ id: m.id, x: Math.min(p1.x, p2.x) - w, y: Math.min(p1.y, p2.y) - w, w: Math.abs(p2.x - p1.x) + w * 2, h: Math.abs(p2.y - p1.y) + w * 2 });
    } else if ((m.kind === "callout" || m.kind === "step") && m.at) {
      const p = px(m.at, W, H);
      if (m.kind === "step") {
        const r = 26 * S;
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.18, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,55,74,0.45)"; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = color === SUN ? OCEAN_DEEP : "#ffffff";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `800 ${30 * S}px Poppins, system-ui, sans-serif`;
        ctx.fillText(String(m.index ?? 1), p.x, p.y + 1 * S);
        ctx.restore();
        hits.push({ id: m.id, x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 });
      } else {
        hits.push({ id: m.id, x: p.x - 20 * S, y: p.y - 20 * S, w: 40 * S, h: 40 * S });
      }
      labelAt = { x: p.x, y: p.y - 30 * S };
    }

    if (m.label && labelAt) {
      ctx.save();
      ctx.font = `${primary ? 700 : 600} ${(primary ? 26 : 22) * S}px Poppins, system-ui, sans-serif`;
      ctx.textAlign = "left";
      const box = placeLabel(ctx, m.label, labelAt, m.labelSide, labelBoxes, S, W, H);
      // A leader line, so a pushed-away label still says what it belongs to.
      if (Math.hypot(box.x + box.w / 2 - labelAt.x, box.y + box.h / 2 - labelAt.y) > 40 * S) {
        stroked(ctx, 2.5 * S, color, [6, 6], S, () => {
          ctx.beginPath(); ctx.moveTo(labelAt!.x, labelAt!.y);
          ctx.lineTo(box.x + box.w / 2, box.y + box.h / 2);
        });
      }
      chip(ctx, box, m.label, color, S, primary);
      labelBoxes.push({ id: m.id, ...box });
      ctx.restore();
    }

    if (sel) {
      const hb = hits[hits.length - 1];
      if (hb) {
        ctx.save();
        ctx.setLineDash([8 * S, 6 * S]);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * S;
        ctx.strokeRect(hb.x - 6 * S, hb.y - 6 * S, hb.w + 12 * S, hb.h + 12 * S);
        ctx.restore();
      }
    }
  }

  // The caption strip last, so nothing draws over the sentence.
  if (plan.caption) {
    ctx.save();
    ctx.font = `700 ${28 * S}px Poppins, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const padX = 22 * S, h = 62 * S;
    const w = Math.min(W - 48 * S, ctx.measureText(plan.caption).width + padX * 2);
    const x = 24 * S, y = H - h - 24 * S;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14 * S);
    ctx.fillStyle = "rgba(0,55,74,0.88)";
    ctx.fill();
    // The sun-to-sea rule NP7 puts under everything it signs.
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, SUN); g.addColorStop(0.48, CORAL); g.addColorStop(1, OCEAN);
    ctx.fillStyle = g;
    ctx.fillRect(x, y + h - 4 * S, w, 4 * S);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(plan.caption, x + padX, y + h / 2 - 2 * S);
    ctx.restore();
  }

  return hits;
}
