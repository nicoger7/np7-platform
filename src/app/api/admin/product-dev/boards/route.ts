import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdList, pdCreate } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { effectiveValue, metricUnit, toMm } from "@/lib/board-measurements";
const CFG = PD_ENTITIES.boards;

type PointRow = { board_id: string; metric: string; station: number; value: number | null };
type SeriesRow = { board_id: string; metric: string; unit: string | null; scale: number };

/**
 * GET /api/admin/product-dev/boards — the list, with what makes a card worth
 * clicking: how many readings it holds, how many metrics it covers, and the
 * width readings its thumbnail outline is drawn from ([station, full width cm],
 * scale applied, never interpolated here). Counted here rather than in the page
 * so the list stays one request.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const listed = await pdList(CFG, request);
  if (!listed.ok) return listed;
  const boards = (await listed.json()) as { id: string }[];
  if (!boards.length) return NextResponse.json([]);

  const db = pdDb();
  const ids = boards.map((b) => b.id);

  // Paged: PostgREST stops at 1000 rows, and a few measured boards pass that.
  const points: PointRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("pd_board_points").select("board_id,metric,station,value")
      .in("board_id", ids).order("id").range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    points.push(...((data ?? []) as PointRow[]));
    if (!data || data.length < 1000) break;
  }
  const { data: seriesRows } = await db.from("pd_board_series").select("board_id,metric,unit,scale")
    .in("board_id", ids).in("metric", ["width", "width_top"]);
  const series = new Map(((seriesRows ?? []) as SeriesRow[]).map((s) => [`${s.board_id}/${s.metric}`, s]));

  const tally = new Map<string, { readings: number; metrics: Set<string>; measured: Set<string>; last: number; w: [number, number][]; wt: [number, number][] }>();
  for (const p of points) {
    const t = tally.get(p.board_id) ?? { readings: 0, metrics: new Set<string>(), measured: new Set<string>(), last: 0, w: [], wt: [] };
    if (p.value != null) { t.readings++; t.measured.add(p.metric); t.last = Math.max(t.last, p.station); }
    t.metrics.add(p.metric);
    if ((p.metric === "width" || p.metric === "width_top") && p.value != null) {
      const s = series.get(`${p.board_id}/${p.metric}`) ?? null;
      const cm = toMm(effectiveValue(p, s) as number, metricUnit(p.metric, s)) / 10;
      (p.metric === "width" ? t.w : t.wt).push([p.station, Math.round(cm * 10) / 10]);
    }
    tally.set(p.board_id, t);
  }

  return NextResponse.json(
    boards.map((b) => {
      const t = tally.get(b.id);
      return {
        ...b,
        readings: t?.readings ?? 0,
        metrics: t?.metrics.size ?? 0,
        // The metrics with at least one number, for the coloured dots on the card.
        measured: t ? [...t.measured] : [],
        outline: { w: t?.w ?? [], wt: t?.wt ?? [] },
        // How far along the board anything was read: the thumbnail's dashed
        // centreline runs this far when no length is stated.
        last_station: t?.last ?? 0,
      };
    }),
  );
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return pdCreate(CFG, request);
}
