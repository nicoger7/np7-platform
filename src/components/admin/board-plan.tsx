"use client";

import { useMemo, useState } from "react";
import {
  BOARD_METRICS, BOARD_METRIC_BY_KEY, effectiveValue, exactValue, fmtReading, methodForScale, metricUnit, round, riseMarkerStation,
  rockerReadout, smoothPath, toMm, widestPoint, zeroCrossing,
  type PdBoard, type PdBoardCutout, type PdBoardPoint, type PdBoardSeries, type SeriesPoints,
} from "@/lib/board-measurements";

/**
 * The 2D plan — outline, rocker and cross-section, drawn from the readings.
 *
 * Three rules this file is built around:
 *
 *   1. It draws ONLY what was measured. The curves are monotone cubic, which
 *      cannot overshoot between two readings, and they stop dead at the last
 *      station instead of extrapolating a nose nobody put a tape on. A drawing
 *      that invents shape is worse than no drawing, because it looks like
 *      information.
 *
 *   2. Every measured point is marked and labelled on the curve. The drawing is
 *      a reading aid for the numbers, not a replacement — the dots are where
 *      the data is, and the smooth line between them is the guess.
 *
 *   3. The vertical scale of the rocker and section views is EXAGGERATED,
 *      because 35 mm of scoop over 230 cm of board is two pixels at true scale.
 *      The factor is a control, it is drawn in the corner, and 1:1 is always
 *      one click away — an unlabelled exaggeration is how a 3 mm V ends up
 *      looking like a wave board's.
 */

type Props = {
  board: PdBoard;
  series: PdBoardSeries[];
  points: PdBoardPoint[];
  cutouts: PdBoardCutout[];
};

type View = "outline" | "rocker" | "section";

const AXIS = "var(--admin-border)";
const INK = "var(--admin-text)";
const FAINT = "var(--admin-text-faint)";

/** Readings for one metric, converted to millimetres and scale applied. */
function mmSeries(points: PdBoardPoint[], series: PdBoardSeries[], metric: string): SeriesPoints {
  const s = series.find((x) => x.metric === metric) ?? null;
  const unit = metricUnit(metric, s);
  return points
    .filter((p) => p.metric === metric && p.value != null)
    .map((p) => ({ station: p.station, value: toMm(effectiveValue(p, s) as number, unit) }))
    .sort((a, b) => a.station - b.station);
}

export function BoardPlan({ board, series, points, cutouts }: Props) {
  const [view, setView] = useState<View>("outline");
  const [exag, setExag] = useState(6);
  const [station, setStation] = useState<number | null>(null);
  const [labels, setLabels] = useState(true);

  const width = useMemo(() => mmSeries(points, series, "width"), [points, series]);
  const rocker = useMemo(() => mmSeries(points, series, "rocker"), [points, series]);
  const thickness = useMemo(() => mmSeries(points, series, "thickness"), [points, series]);
  const vee = useMemo(() => mmSeries(points, series, "v"), [points, series]);
  const concave = useMemo(() => mmSeries(points, series, "concave"), [points, series]);
  const railT = useMemo(() => mmSeries(points, series, "rail_thickness"), [points, series]);

  // The drawing's x-extent: every station anybody measured, plus the board's
  // stated length if it is longer than the last reading.
  const stations = useMemo(() => {
    const all = points.map((p) => p.station);
    const max = Math.max(board.length_cm ?? 0, ...(all.length ? all : [0]));
    const min = Math.min(0, ...(all.length ? all : [0]));
    return { min, max: max || 100 };
  }, [points, board.length_cm]);

  const measuredStations = useMemo(
    () => Array.from(new Set(points.filter((p) => p.value != null).map((p) => p.station))).sort((a, b) => a - b),
    [points],
  );

  // What the section can draw at each station — shown in the picker so a
  // thin station is chosen knowingly, and used to default to the fullest one.
  const coverage = useMemo(() => {
    const has = (pts: SeriesPoints, st: number) => pts.some((p) => p.station === st);
    return new Map(measuredStations.map((st) => [st, [
      has(width, st) ? "W" : null, has(vee, st) ? "V" : null,
      has(concave, st) ? "C" : null, has(thickness, st) ? "T" : null,
    ].filter(Boolean) as string[]]));
  }, [measuredStations, width, vee, concave, thickness]);
  const fullestStation = useMemo(() => {
    let best: number | null = null, n = -1;
    for (const st of measuredStations) {
      const c = coverage.get(st) ?? [];
      if (c.includes("W") && c.length > n) { best = st; n = c.length; }
    }
    return best ?? measuredStations[Math.floor(measuredStations.length / 2)];
  }, [measuredStations, coverage]);

  const anyData = points.some((p) => p.value != null);

  if (!anyData) {
    return (
      <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint max-w-md mx-auto leading-relaxed">
          Nothing to draw yet. The plan is built from the readings — add a width or rocker series on the
          Measurements tab and the outline appears here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {([["outline", "Outline"], ["rocker", "Rocker"], ["section", "Cross-section"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === k ? "" : "admin-muted"}`}
              style={view === k ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : undefined}>
              {label}
            </button>
          ))}
        </div>

        {view !== "outline" && (
          <label className="flex items-center gap-2 text-xs admin-muted">
            Vertical scale
            <select className="px-2 py-1 admin-input border rounded text-xs" value={exag}
              onChange={(e) => setExag(Number(e.target.value))}>
              <option value={1}>1 : 1 (true)</option>
              <option value={3}>×3</option>
              <option value={6}>×6</option>
              <option value={12}>×12</option>
              <option value={25}>×25</option>
            </select>
          </label>
        )}

        {view === "section" && measuredStations.length > 0 && (
          <label className="flex items-center gap-2 text-xs admin-muted">
            Station
            <select className="px-2 py-1 admin-input border rounded text-xs" value={station ?? fullestStation}
              onChange={(e) => setStation(Number(e.target.value))}>
              {measuredStations.map((s) => (
                <option key={s} value={s}>{s} cm · {(coverage.get(s) ?? []).join(" ") || "—"}</option>
              ))}
            </select>
            <span className="text-[10px] admin-faint">W width · V · C concave · T thickness</span>
          </label>
        )}

        <label className="flex items-center gap-1.5 text-xs admin-muted ml-auto">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          Value labels
        </label>
      </div>

      {view === "outline" && (
        <OutlineView board={board} width={width} cutouts={cutouts} stations={stations} labels={labels} />
      )}
      {view === "rocker" && (
        <RockerView board={board} rocker={rocker} thickness={thickness} points={points}
          stations={stations} exag={exag} labels={labels} />
      )}
      {view === "section" && (
        <SliceReadout board={board} station={station ?? fullestStation} points={points} series={series} />
      )}
      {view === "section" && (
        <SectionView board={board} series={series}
          station={station ?? fullestStation}
          width={width} vee={vee} concave={concave} thickness={thickness} railT={railT} exag={exag} />
      )}
    </div>
  );
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

/** The graph paper. Minor line every 10 units, major every 50, labelled. */
function Grid({ x0, x1, y0, y1, toX, toY, step = 10, major = 50, axisLabel }: {
  x0: number; x1: number; y0: number; y1: number;
  toX: (n: number) => number; toY: (n: number) => number;
  step?: number; major?: number; axisLabel?: string;
}) {
  const vlines: number[] = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) vlines.push(x);
  const hlines: number[] = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) hlines.push(y);

  return (
    <g>
      {vlines.map((x) => (
        <line key={`v${x}`} x1={toX(x)} x2={toX(x)} y1={toY(y0)} y2={toY(y1)}
          stroke={AXIS} strokeWidth={x % major === 0 ? 1 : 0.5} opacity={x % major === 0 ? 0.85 : 0.4} />
      ))}
      {hlines.map((y) => (
        <line key={`h${y}`} y1={toY(y)} y2={toY(y)} x1={toX(x0)} x2={toX(x1)}
          stroke={AXIS} strokeWidth={y % major === 0 ? 1 : 0.5} opacity={y % major === 0 ? 0.85 : 0.4} />
      ))}
      {vlines.filter((x) => x % major === 0).map((x) => (
        <text key={`t${x}`} x={toX(x)} y={toY(y0) + 14} textAnchor="middle" fontSize={9} fill={FAINT}>{x}</text>
      ))}
      {axisLabel && (
        <text x={toX(x1)} y={toY(y0) + 26} textAnchor="end" fontSize={9} fill={FAINT}>{axisLabel}</text>
      )}
    </g>
  );
}

function Dots({ pts, toX, toY, color, labels, fmt }: {
  pts: SeriesPoints; toX: (n: number) => number; toY: (n: number) => number;
  color: string; labels: boolean; fmt: (v: number) => string;
}) {
  return (
    <g>
      {pts.map((p) => (
        <g key={p.station}>
          <circle cx={toX(p.station)} cy={toY(p.value)} r={2.6} fill={color} />
          {labels && (
            <text x={toX(p.station)} y={toY(p.value) - 6} textAnchor="middle" fontSize={8.5} fill={color}>
              {fmt(p.value)}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

function Caption({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-3 space-y-1">
      {lines.map((l, i) => (
        <li key={i} className="text-[11px] admin-faint leading-relaxed">{l}</li>
      ))}
    </ul>
  );
}

const frame = { className: "w-full rounded-xl", style: { border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" } };

// ─── Outline (top view) ──────────────────────────────────────────────────────

function OutlineView({ board, width, cutouts, stations, labels }: {
  board: PdBoard; width: SeriesPoints; cutouts: PdBoardCutout[];
  stations: { min: number; max: number }; labels: boolean;
}) {
  const PAD = 34;
  const W = 900;
  const halfMaxMm = width.length ? Math.max(...width.map((p) => p.value)) / 2 : 300;
  const spanCm = stations.max - stations.min || 100;
  const pxPerCm = (W - PAD * 2) / spanCm;
  // True scale in both axes — an outline is the one view that must not be
  // stretched, because its proportions are the thing you are looking at.
  const halfPx = (halfMaxMm / 10) * pxPerCm;
  const H = halfPx * 2 + PAD * 2 + 20;

  const toX = (cm: number) => PAD + (cm - stations.min) * pxPerCm;
  const centre = PAD + halfPx;
  const toYhalf = (mm: number) => centre - (mm / 10) * pxPerCm;

  const half: SeriesPoints = width.map((p) => ({ station: p.station, value: p.value / 2 }));
  const top = smoothPath(half, toX, toYhalf, 8);
  const bottom = smoothPath(half.map((p) => ({ ...p, value: -p.value })), toX, toYhalf, 8);

  const wide = widestPoint(width);
  const hullCutouts = cutouts.filter((c) => c.station_from != null || c.station_to != null);

  if (!width.length) {
    return (
      <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint">No width readings yet — the outline is drawn from them.</p>
      </div>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} {...frame}>
        <Grid x0={stations.min} x1={stations.max} y0={-halfMaxMm / 10} y1={halfMaxMm / 10}
          toX={toX} toY={(cm) => centre - cm * pxPerCm} step={10} major={50}
          axisLabel={`cm from the ${board.station_origin}`} />

        {/* Centreline */}
        <line x1={toX(stations.min)} x2={toX(stations.max)} y1={centre} y2={centre}
          stroke={INK} strokeWidth={0.8} strokeDasharray="6 4" opacity={0.5} />

        {/* Cut-outs and fittings, in the same coordinate as everything else */}
        {hullCutouts.map((c) => {
          const a = toX(c.station_from ?? c.station_to ?? 0);
          const b = toX(c.station_to ?? c.station_from ?? 0);
          const w = ((c.width_cm ?? 4) * pxPerCm);
          const offs = c.mirrored && c.offset_cm ? [c.offset_cm, -c.offset_cm] : [c.offset_cm ?? 0];
          return offs.map((o, i) => (
            <rect key={`${c.id}-${i}`} x={Math.min(a, b)} y={centre - o * pxPerCm - w / 2}
              width={Math.max(Math.abs(b - a), 3)} height={w} rx={3}
              fill="var(--admin-accent)" opacity={0.16} stroke="var(--admin-accent)" strokeWidth={0.9} />
          ));
        })}

        <path d={top} fill="none" stroke={BOARD_METRIC_BY_KEY.width.color} strokeWidth={2} />
        <path d={bottom} fill="none" stroke={BOARD_METRIC_BY_KEY.width.color} strokeWidth={2} />

        <Dots pts={half} toX={toX} toY={toYhalf} color={BOARD_METRIC_BY_KEY.width.color} labels={labels}
          fmt={(v) => `${round(v / 5, 1)}`} />
        {half.map((p) => (
          <line key={`tick${p.station}`} x1={toX(p.station)} x2={toX(p.station)}
            y1={toYhalf(p.value)} y2={toYhalf(-p.value)} stroke={BOARD_METRIC_BY_KEY.width.color}
            strokeWidth={0.6} opacity={0.3} />
        ))}

        {wide && (
          <text x={toX(wide.station)} y={PAD - 12} textAnchor="middle" fontSize={9} fill={FAINT}>
            widest {round(wide.value / 10, 1)} cm
          </text>
        )}
      </svg>

      <Caption lines={[
        "True scale in both axes. The labels on the curve are the half-width; the tick across each station is the full bottom width.",
        `Drawn from ${width.length} width readings between ${width[0].station} and ${width[width.length - 1].station} cm. The curve stops at the last reading — it does not guess a nose or a tail.`,
        board.max_width_cm
          ? `Overall max width ${board.max_width_cm} cm (stated) vs ${wide ? round(wide.value / 10, 1) : "—"} cm widest bottom reading. The difference is the rail wrap.`
          : "No overall max width on the board yet — add one on Overview and it shows against the widest bottom reading.",
      ]} />
    </div>
  );
}

// ─── Rocker (side view) ──────────────────────────────────────────────────────

function RockerView({ board, rocker, thickness, points, stations, exag, labels }: {
  board: PdBoard; rocker: SeriesPoints; thickness: SeriesPoints; points: PdBoardPoint[];
  stations: { min: number; max: number }; exag: number; labels: boolean;
}) {
  const PAD = 40;
  const W = 900;
  const spanCm = stations.max - stations.min || 100;
  const pxPerCm = (W - PAD * 2) / spanCm;
  const pxPerMm = (pxPerCm / 10) * exag;

  // Height follows the rocker and nothing else. The deck line that used to
  // ride here was rocker + thickness interpolated along the whole board — on a
  // board with one thickness reading that is a shape nobody measured, and it
  // squashed the real curve into the bottom fifth of the chart.
  const maxY = Math.max(10, ...rocker.map((p) => p.value));
  const H = maxY * pxPerMm + PAD * 2 + 20;
  const base = H - PAD - 20;

  const toX = (cm: number) => PAD + (cm - stations.min) * pxPerCm;
  const toY = (mm: number) => base - mm * pxPerMm;

  const marker = riseMarkerStation(points);
  const r = rockerReadout(rocker, board.station_origin, marker);

  if (!rocker.length) {
    return (
      <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint">No rocker readings yet.</p>
      </div>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} {...frame}>
        <Grid x0={stations.min} x1={stations.max} y0={0} y1={maxY}
          toX={toX} toY={toY} step={10} major={50} axisLabel={`cm from the ${board.station_origin}`} />

        {/* The straightedge the readings were taken off. */}
        <line x1={toX(stations.min)} x2={toX(stations.max)} y1={base} y2={base} stroke={INK} strokeWidth={1.2} opacity={0.6} />

        <path d={smoothPath(rocker, toX, toY, 8)} fill="none" stroke={BOARD_METRIC_BY_KEY.rocker.color} strokeWidth={2} />
        <Dots pts={rocker} toX={toX} toY={toY} color={BOARD_METRIC_BY_KEY.rocker.color} labels={labels}
          fmt={(v) => `${round(v, 1)}`} />

        {/* Thickness readings, where they were taken — a tick and a number, not
            a deck curve. A deck needs thickness at the same stations as the
            rocker; where that exists it is on the cross-section. */}
        {thickness.map((p) => (
          <g key={`t${p.station}`}>
            <line x1={toX(p.station)} x2={toX(p.station)} y1={PAD - 6} y2={PAD + 8}
              stroke={BOARD_METRIC_BY_KEY.thickness.color} strokeWidth={1.4} />
            <text x={toX(p.station)} y={PAD - 10} textAnchor="middle" fontSize={8.5} fill={BOARD_METRIC_BY_KEY.thickness.color}>
              {round(p.value / 10, 1)} cm thick
            </text>
          </g>
        ))}

        {r.riseFrom != null && (
          <g>
            <line x1={toX(r.riseFrom)} x2={toX(r.riseFrom)} y1={toY(0) + 6} y2={PAD + 16}
              stroke={BOARD_METRIC_BY_KEY.rocker.color} strokeWidth={0.9} strokeDasharray="3 3" opacity={0.7} />
            <text x={toX(r.riseFrom) + 4} y={PAD + 26} fontSize={9} fill={FAINT}>
              rise from {r.riseFrom}{r.riseFromMarker ? "" : " (last zero)"}
            </text>
          </g>
        )}

        <text x={W - PAD} y={H - 6} textAnchor="end" fontSize={9} fill={FAINT}>
          vertical ×{exag} · values in mm
        </text>
      </svg>

      <Caption lines={[
        exag === 1
          ? "True scale. At 1:1 a scoop-rocker line is almost a straight line — that is what it actually looks like."
          : `Vertical scale exaggerated ×${exag} so the curve is readable. Horizontal is true scale; the two axes are NOT comparable in this view.`,
        `The curve runs from ${rocker[0].station} to ${rocker[rocker.length - 1].station} cm, through the readings only. Nothing outside them is drawn.`,
        r.scoop ? `Scoop ${round(r.scoop.value, 1)} mm at station ${r.scoop.station} (the nose end).` : "No scoop measured at the nose end.",
        r.tailKick
          ? `Tail kick ${round(r.tailKick.value, 1)} mm at station ${r.tailKick.station}.`
          : r.tailEdgeStation != null && r.tailEdgeStation > 0
            ? `No tail kick recorded: the tail-most reading is at ${r.tailEdgeStation} cm and the kick sits behind that, in the last few cm at the fin. Measure at 0 and 5 cm off the same straightedge.`
            : "No tail kick: the reading at the tail edge is zero.",
        thickness.length
          ? `Thickness was read at ${thickness.map((p) => `${p.station}`).join(", ")} cm — shown as ticks, not as a deck line.`
          : "No thickness readings.",
      ]} />
    </div>
  );
}

// ─── Cross-section ───────────────────────────────────────────────────────────

/**
 * The bottom, rail to rail, at one station — built ONLY from readings taken at
 * that exact station.
 *
 * Nothing here is interpolated. Every element is drawn if its reading exists
 * at this station and left out if it does not, and the caption lists both.
 * The first version read every input off a curve, which meant a thickness
 * measured once at 90 cm produced a full deck at 60 — a shape nobody measured,
 * drawn with the same confidence as the ones that were.
 *
 *   rails       need the width. Without it there is no section at all.
 *   V line      the rail sits `v` above (V) or below (inverted) the centre.
 *               Without a V reading the rails are drawn ON the reference plane
 *               and the caption says their height is unknown.
 *   concave     a dish cut below the V line — needs V AND concave here.
 *   deck        needs thickness here; falls to the rail thickness if that was
 *               read here too, else to the rail point.
 */
function SectionView({ board, series, station, width, vee, concave, thickness, railT, exag }: {
  board: PdBoard; series: PdBoardSeries[]; station: number;
  width: SeriesPoints; vee: SeriesPoints; concave: SeriesPoints;
  thickness: SeriesPoints; railT: SeriesPoints; exag: number;
}) {
  const w = exactValue(width, station);
  const v = exactValue(vee, station);
  const c = exactValue(concave, station);
  const t = exactValue(thickness, station);
  const rt = exactValue(railT, station);
  const concaveVariant = series.find((s) => s.metric === "concave")?.variant ?? "double";

  if (w == null) {
    return (
      <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
        <p className="text-sm admin-faint max-w-md mx-auto leading-relaxed">
          No width reading at station {station}. The section needs one to know how wide to draw, and it
          does not borrow from the neighbouring stations.
        </p>
      </div>
    );
  }

  const PAD = 46;
  const W = 760;
  const halfMm = w / 2;
  const pxPerMmX = (W - PAD * 2) / (halfMm * 2);
  const pxPerMmY = pxPerMmX * exag;

  const railY = v ?? 0;
  const top = Math.max(t ?? 0, railY + (rt ?? 0), Math.abs(railY), Math.abs(c ?? 0), 6);
  const H = Math.max(160, top * pxPerMmY + PAD * 2);
  const baseY = H - PAD;
  const cx = W / 2;
  const toX = (mm: number) => cx + mm * pxPerMmX;
  const toY = (mm: number) => baseY - mm * pxPerMmY;

  const N = 80;
  const xs = Array.from({ length: N + 1 }, (_, i) => -halfMm + (2 * halfMm * i) / N);

  // Bottom: only with a V reading; the dish only with a concave reading too.
  const bottomPath = v != null
    ? xs.map((x, i) => {
        const tt = Math.abs(x) / halfMm;
        const ref = v * tt;
        const dish = c == null ? 0 : c * (concaveVariant === "single" ? 1 - tt * tt : Math.sin(Math.PI * tt));
        return `${i ? "L" : "M"} ${toX(x)} ${toY(ref - dish)}`;
      }).join(" ")
    : "";

  // Deck: only with a thickness reading here.
  const deckPath = t != null
    ? xs.map((x, i) => {
        const tt = Math.abs(x) / halfMm;
        const railTop = railY + (rt ?? 0);
        // Elliptical fall from the centre thickness to the rail — a deck is
        // convex; a straight taper would draw a wedge no board has.
        const y = t + (railTop - t) * (1 - Math.sqrt(Math.max(0, 1 - tt * tt)));
        return `${i ? "L" : "M"} ${toX(x)} ${toY(y)}`;
      }).join(" ")
    : "";

  const have: string[] = [`width ${round(w / 10, 1)} cm`];
  const missing: string[] = [];
  if (v != null) have.push(`V ${round(v, 2)} mm${v < 0 ? " (inverted)" : ""}`); else missing.push("V");
  if (c != null) have.push(`${concaveVariant} concave ${round(c, 2)} mm`); else missing.push("concave");
  if (t != null) have.push(`thickness ${round(t / 10, 1)} cm`); else missing.push("thickness");
  if (rt != null) have.push(`rail ${round(rt, 1)} mm`); else if (t != null) missing.push("rail thickness");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} {...frame}>
        <line x1={PAD / 2} x2={W - PAD / 2} y1={baseY} y2={baseY} stroke={AXIS} strokeWidth={1} />
        <line x1={cx} x2={cx} y1={PAD / 2} y2={baseY + 8} stroke={AXIS} strokeWidth={0.7} strokeDasharray="4 4" />

        {v != null && c != null && (
          <path d={`M ${toX(-halfMm)} ${toY(v)} L ${toX(0)} ${toY(0)} L ${toX(halfMm)} ${toY(v)}`}
            fill="none" stroke={BOARD_METRIC_BY_KEY.v.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.65} />
        )}
        {bottomPath && (
          <path d={bottomPath} fill="none" stroke={c != null ? BOARD_METRIC_BY_KEY.concave.color : BOARD_METRIC_BY_KEY.v.color} strokeWidth={2.2} />
        )}
        {deckPath && <path d={deckPath} fill="none" stroke={BOARD_METRIC_BY_KEY.thickness.color} strokeWidth={2} />}

        {[-halfMm, halfMm].map((x) => (
          <g key={x}>
            <circle cx={toX(x)} cy={toY(railY)} r={3} fill={BOARD_METRIC_BY_KEY.rail_thickness.color} />
            {t != null && rt != null && (
              <line x1={toX(x)} x2={toX(x)} y1={toY(railY)} y2={toY(railY + rt)}
                stroke={BOARD_METRIC_BY_KEY.rail_thickness.color} strokeWidth={1.4} />
            )}
          </g>
        ))}

        <text x={W - PAD / 2} y={PAD / 2 + 4} textAnchor="end" fontSize={9} fill={FAINT}>
          station {station} cm · vertical ×{exag}
        </text>
        <text x={PAD / 2} y={PAD / 2 + 4} fontSize={9} fill={FAINT}>
          {round(w / 10, 1)} cm bottom width
        </text>
        {missing.length > 0 && (
          <text x={cx} y={PAD / 2 + 4} textAnchor="middle" fontSize={9} fill={FAINT}>
            not measured here: {missing.join(", ")}
          </text>
        )}
      </svg>

      <Caption lines={[
        `Measured at ${station} cm: ${have.join(" · ")}.`,
        missing.length
          ? `Not measured at ${station} cm, so not drawn: ${missing.join(", ")}.${v == null ? " Without V the rails are placed on the reference plane; their real height is unknown." : ""}`
          : "Every element of this section was measured at this station.",
        "Nothing is read off a curve here. Pick a station with more readings for a fuller section.",
        board.station_origin === "tail" ? "Looking forward from the tail." : "Looking aft from the nose.",
      ]} />
    </div>
  );
}

// ─── The slice strip: every metric at ONE station ────────────────────────────

/**
 * The same box as the board readout, for the station the section is showing.
 *
 * Exact readings only, in the units they were taken in. A metric that was
 * measured on the board but not at this station says so, which is different
 * from one never measured at all — and the hint carries the two things the
 * bare number hides: a display scale ("×0.5 applied, read 2.1") and the note
 * written on the tape at that station ("Normal V from here").
 */
function SliceReadout({ board, station, points, series }: {
  board: PdBoard; station: number; points: PdBoardPoint[]; series: PdBoardSeries[];
}) {
  const cells = BOARD_METRICS.map((m) => {
    const s = series.find((x) => x.metric === m.key) ?? null;
    const p = points.find((x) => x.metric === m.key && x.station === station);
    const unit = metricUnit(m.key, s);
    const onBoard = points.some((x) => x.metric === m.key && (x.value != null || x.text_value));
    const base = { label: m.label, color: m.color, title: undefined as string | undefined };

    if (!p || (p.value == null && !p.text_value)) {
      return { ...base, value: "—", hint: onBoard ? `not measured at ${station} cm` : "not on this board", missing: true };
    }
    if (m.kind === "choice") {
      const word = m.choices?.find((c) => c.key === p.text_value)?.label ?? p.text_value ?? "—";
      const hint = [p.value != null ? `${p.value} ${unit} ${m.numberLabel?.toLowerCase() ?? ""}`.trim() : null, p.note].filter(Boolean).join(" · ");
      return { ...base, value: word, hint: hint || undefined, missing: false };
    }
    const v = effectiveValue(p, s);
    // Plain words, not the mechanics: "halved, tape read 2.1" — the sign is
    // already said by "inverted V" in the value, and the series variant is a
    // per-board setting that means nothing at one station. ("×0.5 applied ·
    // read -2.1 · mixed" was the first version, and it earned a "??".)
    const method = methodForScale(m.key, s?.scale);
    const scaled = v != null && p.value != null && v !== p.value;
    const untouched = !scaled && method != null && s?.scale !== 1 && p.value != null;
    const scaleWord = !scaled ? null : s!.scale === 0.5 ? "halved" : s!.scale === 2 ? "doubled" : `×${s!.scale}`;
    const hint = [
      scaled ? `tape read ${Math.abs(p.value as number)}, ${method ? "tape = 2 × V, halved" : scaleWord}` : null,
      untouched ? "as read, measured across both rails" : null,
      p.note ?? null,
    ].filter(Boolean).join(" · ");
    return {
      ...base,
      value: v == null ? (p.text_value ?? "—") : fmtReading(m.key, round(v, 3), unit),
      hint: hint || unit,
      title: method ? `${method.label}${s?.convention ? ` Series note: "${s.convention}".` : ""} Change it in the column header on the Measurements tab.` : undefined,
      missing: false,
    };
  });

  return (
    <div className="mb-4">
      <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1.5">
        At {station} cm from the {board.station_origin}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-border)" }}>
        {cells.map((c) => (
          <div key={c.label} className="px-3 py-2.5" style={{ backgroundColor: "var(--admin-surface)" }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] admin-faint uppercase">
              <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color, opacity: c.missing ? 0.35 : 1 }} />
              <span className="truncate">{c.label}</span>
            </div>
            <div className={`text-base font-bold leading-tight ${c.missing ? "admin-faint" : "admin-heading"}`}>{c.value}</div>
            {c.hint && <div className="text-[10px] admin-faint truncate" title={c.title ?? c.hint}>{c.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── The readout strip, used above the plan and on the measurements tab ──────

export function BoardReadout({ board, series, points }: { board: PdBoard; series: PdBoardSeries[]; points: PdBoardPoint[] }) {
  const width = mmSeries(points, series, "width");
  const rocker = mmSeries(points, series, "rocker");
  const vee = mmSeries(points, series, "v");
  const wide = widestPoint(width);
  const r = rockerReadout(rocker, board.station_origin, riseMarkerStation(points));
  const cross = zeroCrossing(vee);

  const cells: { label: string; value: string; hint?: string }[] = [
    { label: "Widest bottom", value: wide ? `${round(wide.value / 10, 1)} cm` : "—", hint: wide ? `at ${wide.station} cm` : undefined },
    { label: "Max width", value: board.max_width_cm ? `${board.max_width_cm} cm` : "—", hint: "overall, stated" },
    { label: "Scoop", value: r.scoop ? `${round(r.scoop.value, 1)} mm` : "—", hint: r.scoop ? `at ${r.scoop.station} cm` : "nose end" },
    {
      label: "Tail kick",
      value: r.tailKick ? `${round(r.tailKick.value, 1)} mm` : "—",
      hint: r.tailKick
        ? `at ${r.tailKick.station} cm`
        : r.tailEdgeStation != null && r.tailEdgeStation > 0
          ? `not measured: nothing below ${r.tailEdgeStation} cm`
          : rocker.length ? "tail edge reads 0" : "no rocker readings",
    },
    { label: "Rocker starts", value: r.riseFrom != null ? `${r.riseFrom} cm` : "—", hint: r.riseFromMarker ? "marked" : "last zero" },
    { label: "V crossover", value: cross != null ? `${cross} cm` : "—", hint: vee.length ? "inverted → V" : "no V readings" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-xl overflow-hidden mb-5"
      style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-border)" }}>
      {cells.map((c) => (
        <div key={c.label} className="px-3 py-2.5" style={{ backgroundColor: "var(--admin-surface)" }}>
          <div className="text-[10px] font-bold tracking-[0.08em] admin-faint uppercase">{c.label}</div>
          <div className="text-base font-bold admin-heading leading-tight">{c.value}</div>
          {c.hint && <div className="text-[10px] admin-faint">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
