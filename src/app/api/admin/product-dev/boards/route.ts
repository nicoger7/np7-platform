import { NextRequest, NextResponse } from "next/server";
import { PD_ENTITIES, pdDb, pdList, pdCreate } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
const CFG = PD_ENTITIES.boards;

/**
 * GET /api/admin/product-dev/boards — the list, with the two counts that make
 * a row worth clicking: how many readings it holds and how many metrics it
 * covers. Counted here rather than in the page so the list stays one request.
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
  const points = await db.from("pd_board_points").select("board_id,metric,value").in("board_id", ids);

  const tally = new Map<string, { readings: number; metrics: Set<string> }>();
  for (const p of (points.data ?? []) as { board_id: string; metric: string; value: number | null }[]) {
    const t = tally.get(p.board_id) ?? { readings: 0, metrics: new Set<string>() };
    if (p.value != null) t.readings++;
    t.metrics.add(p.metric);
    tally.set(p.board_id, t);
  }

  return NextResponse.json(
    boards.map((b) => ({
      ...b,
      readings: tally.get(b.id)?.readings ?? 0,
      metrics: tally.get(b.id)?.metrics.size ?? 0,
    })),
  );
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  return pdCreate(CFG, request);
}
