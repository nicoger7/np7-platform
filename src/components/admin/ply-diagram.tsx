"use client";

import { groupPliesByStack, type PdMaterial, type PdPly } from "@/lib/product-dev";

/**
 * The layup diagram, drawn from the ply rows.
 *
 * Deliberately a projection of the data rather than an uploaded image: it can't
 * drift from the table, and sitting next to the original supplier drawing it
 * doubles as a transcription checksum — if a colour or a length is wrong in the
 * database, the shape is visibly wrong here.
 *
 * Inline SVG, no charting library (same call as /api/share-card, which builds its
 * graphics by hand).
 */

const BAR_H = 18;
const BAR_GAP = 3;
const LABEL_W = 34;   // ply index gutter
const LEN_W = 46;     // length readout on the right
const STACK_GAP = 14; // the visible break between stacks

type LaidOutStack = { startY: number; rows: { ply: PdPly; rowY: number }[] };

/** Pure vertical layout — resolved before any JSX is emitted, so nothing mutates
 *  mid-render. */
function layout(stacks: { stack: string | null; plies: PdPly[] }[]): LaidOutStack[] {
  const out: LaidOutStack[] = [];
  let cursor = 4;
  for (let gi = 0; gi < stacks.length; gi++) {
    if (gi > 0) cursor += STACK_GAP;
    const startY = cursor;
    const rows = stacks[gi].plies.map((ply) => {
      const rowY = cursor;
      cursor += BAR_H + BAR_GAP;
      return { ply, rowY };
    });
    out.push({ startY, rows });
  }
  return out;
}

export function PlyDiagram({
  plies,
  materials,
  maxLengthCm,
}: {
  plies: PdPly[];
  materials: PdMaterial[];
  /** Pin the scale across several diagrams so a compare view is honest. */
  maxLengthCm?: number;
}) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const stacks = groupPliesByStack(plies);
  const longest = maxLengthCm ?? Math.max(1, ...plies.map((p) => Number(p.length_cm) || 0));

  if (!plies.length) {
    return <p className="text-xs admin-faint py-6 text-center">No plies yet — add the first row and the diagram draws itself.</p>;
  }

  const barMaxW = 340;
  const width = LABEL_W + barMaxW + LEN_W;
  const height =
    plies.length * (BAR_H + BAR_GAP) + Math.max(0, stacks.length - 1) * STACK_GAP + 8;

  const laidOut = layout(stacks);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Layup diagram, ${plies.length} plies in ${stacks.length} stack${stacks.length !== 1 ? "s" : ""}`}>
        {laidOut.map((group, gi) => {
          const startY = group.startY;
          const bars = group.rows.map(({ ply: p, rowY }) => {
            const mat = byId.get(p.material_id);
            const len = Number(p.length_cm) || 0;
            const w = Math.max(2, (len / longest) * barMaxW);
            return (
              <g key={p.id}>
                <text x={LABEL_W - 8} y={rowY + BAR_H / 2 + 4} textAnchor="end"
                  fontSize="10" fill="currentColor" className="admin-faint">
                  {p.ply_index}
                </text>
                <rect
                  x={LABEL_W} y={rowY} width={w} height={BAR_H} rx={3}
                  fill={mat?.diagram_color || "var(--admin-border-strong)"}
                  stroke="rgba(0,0,0,0.18)" strokeWidth="0.5"
                >
                  <title>
                    {`Ply ${p.ply_index}${p.template_ref ? ` · template ${p.template_ref}` : ""}\n` +
                     `${mat?.name ?? "No material"}${p.orientation || mat?.default_orientation ? ` · ${p.orientation || mat?.default_orientation}` : ""}\n` +
                     `${len} cm`}
                  </title>
                </rect>
                {p.template_ref && w > 22 && (
                  <text x={LABEL_W + 6} y={rowY + BAR_H / 2 + 4} fontSize="10" fontWeight="700" fill="#fff" opacity={0.9}>
                    {p.template_ref}
                  </text>
                )}
                <text x={LABEL_W + w + 6} y={rowY + BAR_H / 2 + 4} fontSize="10" fill="currentColor" className="admin-muted">
                  {len || "—"}
                </text>
              </g>
            );
          });

          return (
            <g key={`stack-${gi}`}>
              {/* The stack boundary is drawn from the `stack` column, never
                  inferred from where the lengths happen to jump. */}
              {gi > 0 && (
                <line x1={LABEL_W} y1={startY - STACK_GAP / 2} x2={LABEL_W + barMaxW} y2={startY - STACK_GAP / 2}
                  stroke="var(--admin-border-strong)" strokeWidth="1" strokeDasharray="3 3" />
              )}
              {bars}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * The fin silhouette, cut short by a ply's length: trailing edge (right) holds
 * width most of the way down then sweeps in; leading edge (left) cuts away
 * high; the tip rounds off narrow and slightly left of centre. Matched by eye
 * against the printed layup sheets — a fatter, blunter shape reads as a bar
 * chart with rounded corners rather than as a fin. Shared by the read-only
 * diagram and the Baukasten so the two can never drift apart.
 */
export function finSilhouettePath(w: number, h: number): string {
  return [
    `M 0 0`,
    `L ${w} 0`,
    `C ${w * 0.98} ${h * 0.55}, ${w * 0.86} ${h * 0.88}, ${w * 0.42} ${h}`,
    `C ${w * 0.22} ${h * 0.96}, ${w * 0.04} ${h * 0.66}, 0 ${h * 0.30}`,
    `Z`,
  ].join(" ");
}

/**
 * The house diagram — plies as fin silhouettes in a row, the way the layup
 * sheets have always been drawn.
 *
 * This is not decoration. Read as bars you compare lengths; read as fins you see
 * the SHAPE of the stack — where the wide plies stop, where a heavier cloth is
 * dropped in, how fast the tip tapers. That is the thing people actually point
 * at in a meeting, so it earns being a first-class view rather than an export.
 *
 * Each ply is drawn as a leading-edge curve down to a rounded tip, scaled by its
 * length. Same rows, same colours as the table — one dataset, two readings.
 */
export function PlyFins({
  plies, materials, maxLengthCm, showStackBreak = true,
}: {
  plies: PdPly[];
  materials: PdMaterial[];
  maxLengthCm?: number;
  showStackBreak?: boolean;
}) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const ordered = [...plies].sort((a, b) => a.ply_index - b.ply_index);
  const longest = maxLengthCm ?? Math.max(1, ...ordered.map((p) => Number(p.length_cm) || 0));

  if (!ordered.length) {
    return <p className="text-xs admin-faint py-6 text-center">No plies yet.</p>;
  }

  const COL = 44;        // horizontal pitch between plies
  const W = 30;          // widest part of a ply, at the root
  const TOP = 26;        // room for the ply number
  const H = 300;         // full-length ply height
  const BOTTOM = 26;     // room for the length readout
  const width = ordered.length * COL + 16;
  const height = TOP + H + BOTTOM;

  const finPath = (h: number) => finSilhouettePath(W, h);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Layup diagram — ${ordered.length} plies drawn as fin outlines`}>
        {/* Baseline the plies hang from, plus quiet depth guides. */}
        <line x1={4} y1={TOP} x2={width - 8} y2={TOP} stroke="var(--admin-border-strong)" strokeWidth="1" />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={4} y1={TOP + H * f} x2={width - 8} y2={TOP + H * f}
            stroke="var(--admin-border)" strokeWidth="0.5" />
        ))}

        {ordered.map((p, i) => {
          const mat = byId.get(p.material_id);
          const len = Number(p.length_cm) || 0;
          const h = Math.max(12, (len / longest) * H);
          const x = 8 + i * COL;
          const prev = i > 0 ? ordered[i - 1] : null;
          const isBreak = showStackBreak && prev && (p.stack ?? null) !== (prev.stack ?? null);
          return (
            <g key={p.id}>
              {isBreak && (
                <line x1={x - 7} y1={TOP - 6} x2={x - 7} y2={TOP + H + 6}
                  stroke="var(--admin-border-strong)" strokeWidth="1" strokeDasharray="3 3" />
              )}
              <text x={x + W / 2} y={TOP - 10} textAnchor="middle" fontSize="12" fontWeight="600"
                fill="currentColor" className="admin-muted">{p.ply_index}</text>
              <g transform={`translate(${x} ${TOP})`}>
                <path d={finPath(h)} fill={mat?.diagram_color || "var(--admin-border-strong)"}>
                  <title>{`Ply ${p.ply_index} · ${mat?.name ?? "no material"} · ${len} cm`}</title>
                </path>
              </g>
              <text x={x + W / 2} y={TOP + H + 16} textAnchor="middle" fontSize="11"
                fill="currentColor" className="admin-muted tabular-nums">{len || "—"}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The material key beneath the diagram — colour, name, orientation. */
export function PlyLegend({ plies, materials }: { plies: PdPly[]; materials: PdMaterial[] }) {
  const used = new Set(plies.map((p) => p.material_id));
  const shown = materials.filter((m) => used.has(m.id));
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
      {shown.map((m) => (
        <span key={m.id} className="flex items-center gap-1.5 text-[11px] admin-muted">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: m.diagram_color || "var(--admin-border-strong)" }} />
          {m.name}
          {m.default_orientation && <span className="admin-faint">{m.default_orientation}</span>}
        </span>
      ))}
    </div>
  );
}

/** Total areal weight by fibre — the quick sanity number when comparing sheets. */
export function plyTotals(plies: PdPly[], materials: PdMaterial[]): { label: string; value: string }[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const gsm = new Map<string, number>();
  for (const p of plies) {
    const m = byId.get(p.material_id);
    if (!m?.gsm) continue;
    gsm.set(m.fibre, (gsm.get(m.fibre) ?? 0) + Number(m.gsm));
  }
  const longest = Math.max(0, ...plies.map((p) => Number(p.length_cm) || 0));
  return [
    { label: "Plies", value: String(plies.length) },
    ...[...gsm.entries()].map(([fibre, total]) => ({ label: `${fibre} g/m²`, value: String(total) })),
    { label: "Longest ply", value: longest ? `${longest} cm` : "—" },
  ];
}
