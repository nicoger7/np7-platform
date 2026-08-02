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
