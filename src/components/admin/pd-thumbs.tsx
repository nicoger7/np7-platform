"use client";

import { finSilhouettePath } from "@/components/admin/ply-diagram";
import { interpolate, type SeriesPoints } from "@/lib/board-measurements";
import { Icon, KIND_META, toneVars, type IconName, type Tone } from "@/components/admin/pd-ui";
import type { PdKind } from "@/lib/product-dev";

/**
 * Thumbnails drawn from the data, never from a stock picture.
 *
 * The same rule as the 2D plan: a board's outline is its width readings and
 * nothing else. Where the tape never went, the drawing stops, and a dashed
 * centreline shows the length it would have covered. A made-up nose would
 * look like information (the first mock-up did exactly that, and was called
 * "insanely inaccurate").
 */

/** [station cm, full width cm] */
export type WidthPair = [number, number];

export function BoardOutlineThumb({
  width, widthTop, lengthCm, origin = "tail", scaleCm, maxWidthCm, tone = "sky", className = "w-full",
}: {
  width: WidthPair[];
  widthTop?: WidthPair[];
  lengthCm?: number | null;
  origin?: "tail" | "nose";
  /** Pin the length scale across a list so boards compare at a glance. */
  scaleCm?: number;
  /** Pin the width scale the same way. */
  maxWidthCm?: number;
  tone?: Tone;
  className?: string;
}) {
  const toPts = (s: WidthPair[] | undefined): SeriesPoints =>
    (s ?? []).filter(([, w]) => Number.isFinite(w) && w > 0)
      .map(([station, w]) => ({ station, value: w / 2 }))
      .sort((a, b) => a.station - b.station);
  const bottom = toPts(width);
  const top = toPts(widthTop);
  const outer = top.length ? top : bottom;
  const stations = [...bottom, ...top].map((p) => p.station);
  const L = Math.max(lengthCm ?? 0, ...(stations.length ? stations : [0]), 1);
  const S = Math.max(scaleCm ?? 0, L);
  const halfMax = Math.max((maxWidthCm ?? 0) / 2, ...outer.map((p) => p.value), 20) * 1.12;
  const ox = (S - L) / 2;
  // Nose to the right on every thumbnail, whichever end the tape hooked on.
  const X = (st: number) => ox + (origin === "tail" ? st : L - st);

  const edge = (pts: SeriesPoints): string => {
    if (pts.length < 2) return "";
    const a = pts[0].station, b = pts[pts.length - 1].station;
    const n = Math.max(12, Math.round((b - a) / 2));
    const upper: string[] = [], lower: string[] = [];
    for (let i = 0; i <= n; i++) {
      const st = a + ((b - a) * i) / n;
      const h = interpolate(pts, st) ?? 0;
      upper.push(`${X(st).toFixed(2)} ${(-h).toFixed(2)}`);
      lower.unshift(`${X(st).toFixed(2)} ${h.toFixed(2)}`);
    }
    return `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;
  };

  return (
    <svg viewBox={`0 ${-halfMax} ${S} ${halfMax * 2}`} className={`pd-tone ${className}`} style={toneVars(tone)}
      preserveAspectRatio="xMidYMid meet" role="img" aria-label="Board outline from the width readings">
      <line x1={X(0)} x2={X(L)} y1={0} y2={0} stroke="var(--tone)" strokeOpacity={0.45}
        strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {outer.length >= 2 && (
        <path d={edge(outer)} fill="var(--tone-bg)" stroke="var(--tone)" strokeWidth={1.6}
          strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      )}
      {top.length >= 2 && bottom.length >= 2 && (
        <path d={edge(bottom)} fill="none" stroke="var(--tone)" strokeOpacity={0.55} strokeWidth={1}
          strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/**
 * A fin drawn from its reference build sheet: every ply as a fin silhouette cut
 * to its own length, longest at the back, in the material's own colour. The
 * bands near the tip are where the plies drop off.
 */
export function FinThumb({ plies, className = "h-full" }: { plies: { l: number; c: string | null }[]; className?: string }) {
  const valid = plies.filter((p) => p.l > 0);
  const max = Math.max(1, ...valid.map((p) => p.l));
  const sorted = [...valid].sort((a, b) => b.l - a.l);
  return (
    <svg viewBox="0 0 60 100" className={className} role="img" aria-label="Fin drawn from the ply lengths">
      <rect x={9} y={3} width={42} height={4} rx={1.5} fill="var(--admin-text-faint)" opacity={0.5} />
      <g transform="translate(13 7)">
        {sorted.map((p, i) => (
          <path key={i} d={finSilhouettePath(34, Math.max(6, (88 * p.l) / max))}
            fill={p.c || "var(--admin-border-strong)"} stroke="rgba(0,0,0,0.22)" strokeWidth={0.35} />
        ))}
      </g>
    </svg>
  );
}

/** Fallback when there is nothing to draw yet: the kind's icon on its colour. */
export function KindGlyph({ kind, icon, tone, className = "w-10 h-10" }: { kind?: PdKind; icon?: IconName; tone?: Tone; className?: string }) {
  const m = kind ? KIND_META[kind] : null;
  const t = tone ?? m?.tone ?? "slate";
  return (
    <span className="pd-tone inline-flex" style={{ ...toneVars(t), color: "var(--tone)", opacity: 0.8 }}>
      <Icon name={icon ?? m?.icon ?? "box"} className={className} strokeWidth={1.4} />
    </span>
  );
}
