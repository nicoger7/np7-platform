import { WIND_DIRECTIONS, WIND_QUALITY_META } from "@/lib/spotguide";

/** Wind window rose — 8 wedges coloured by quality (best / works / no-go).
    Shared, pure SVG (mirrors the magazine's). */
function qualityColor(q: string): string {
  return q === "best" ? "#1f9e57" : q === "good" ? "#e0922a" : q === "no" ? "#d3dbdf" : "#eef1f2";
}
function wedgePath(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
  const xy = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const [x1, y1] = xy(ro, a0); const [x2, y2] = xy(ro, a1);
  const [x3, y3] = xy(ri, a1); const [x4, y4] = xy(ri, a0);
  return `M ${x1} ${y1} A ${ro} ${ro} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 0 0 ${x4} ${y4} Z`;
}

export function WindRose({ window: w, size = 120 }: { window: Record<string, string>; size?: number }) {
  const cx = 65, cy = 65, ri = 24, ro = 50, labelR = 60;
  return (
    <svg viewBox="0 0 130 130" style={{ width: size, height: size }} className="shrink-0" role="img" aria-label="Wind directions">
      {WIND_DIRECTIONS.map((d, i) => {
        const center = i * 45;
        return <path key={d} d={wedgePath(cx, cy, ri, ro, center - 22.5, center + 22.5)} fill={qualityColor(w[d] ?? "")} stroke="#fff" strokeWidth="1.5" />;
      })}
      {WIND_DIRECTIONS.map((d, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        return (
          <text key={d} x={cx + labelR * Math.cos(a)} y={cy + labelR * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="800" fill="#5a6b72">{d}</text>
        );
      })}
    </svg>
  );
}

export function WindRoseLegend() {
  return (
    <ul className="space-y-1">
      {WIND_QUALITY_META.map((q) => (
        <li key={q.id} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5a6b72]">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.color }} />{q.label}
        </li>
      ))}
    </ul>
  );
}
