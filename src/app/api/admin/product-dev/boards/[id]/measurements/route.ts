import { NextRequest, NextResponse } from "next/server";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";

/**
 * The readings, one metric at a time.
 *
 * PUT replaces a SINGLE metric's points wholesale, not the whole board. The
 * grid edits one column at a time and a measuring session adds one metric at a
 * time, so scoping the replace to a metric means a failed save can never take
 * the other five down with it — and two people measuring different metrics on
 * the same board do not overwrite each other.
 *
 * The series settings row rides along in the same call, because it is edited in
 * the same place (the column header) and saving one without the other is how a
 * "halve these" convention ends up attached to the wrong numbers.
 */

type IncomingPoint = { station: number; value?: number | null; text_value?: string | null; note?: string | null };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const metric = request.nextUrl.searchParams.get("metric");
  const db = pdDb();
  let q = db.from("pd_board_points").select("*").eq("board_id", id);
  if (metric) q = q.eq("metric", metric);
  const { data, error } = await q.order("metric").order("station");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    metric?: string;
    points?: IncomingPoint[];
    series?: Record<string, unknown> | null;
  };
  const metric = (body.metric ?? "").trim();
  if (!metric) return NextResponse.json({ error: "metric is required" }, { status: 400 });

  const db = pdDb();
  const now = new Date().toISOString();

  if (body.series) {
    const s = body.series;
    const row = {
      board_id: id,
      metric,
      unit: s.unit === "" ? null : (s.unit ?? null),
      variant: s.variant === "" ? null : (s.variant ?? null),
      // A scale of 0 would silently zero every reading on the board. It is
      // never a legitimate convention, so it is rejected rather than stored.
      scale: Number(s.scale) > 0 ? Number(s.scale) : 1,
      relative_to: s.relative_to === "" ? null : (s.relative_to ?? null),
      convention: s.convention === "" ? null : (s.convention ?? null),
      enabled: s.enabled === undefined ? true : Boolean(s.enabled),
      sort_order: Number(s.sort_order) || 0,
      notes: s.notes === "" ? null : (s.notes ?? null),
      updated_at: now,
    };
    const { error } = await db.from("pd_board_series").upsert(row, { onConflict: "board_id,metric" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!Array.isArray(body.points)) return NextResponse.json({ ok: true, points: null });

  // Keep only rows that say something: a station with a value, a word, or a
  // note is real; a row with a station and nothing else is a placeholder the
  // grid draws from `stations` and does not need stored.
  const rows = body.points
    .filter((p) => Number.isFinite(Number(p.station)))
    .filter((p) => p.value != null || (p.text_value ?? "") !== "" || (p.note ?? "") !== "")
    .map((p) => ({
      board_id: id,
      metric,
      station: Number(p.station),
      value: p.value == null || (p.value as unknown) === "" ? null : Number(p.value),
      text_value: (p.text_value ?? "") === "" ? null : p.text_value,
      note: (p.note ?? "") === "" ? null : p.note,
      updated_at: now,
    }));

  const dupes = rows.map((r) => r.station).filter((s, i, a) => a.indexOf(s) !== i);
  if (dupes.length) {
    return NextResponse.json({ error: `Station ${dupes[0]} appears twice.` }, { status: 400 });
  }

  const { error: delErr } = await db.from("pd_board_points").delete().eq("board_id", id).eq("metric", metric);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  if (!rows.length) return NextResponse.json({ ok: true, count: 0 });
  const { data, error } = await db.from("pd_board_points").insert(rows).select();
  if (error) {
    return NextResponse.json(
      { error: `${error.message} — the previous readings for this metric were already cleared, so re-save to restore them.` },
      { status: 400 },
    );
  }
  await db.from("pd_boards").update({ updated_at: now }).eq("id", id);
  return NextResponse.json({ ok: true, count: data?.length ?? 0, points: data ?? [] });
}

/** DELETE ?metric=v — drop a metric from the board entirely, series and all. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id } = await params;
  const metric = request.nextUrl.searchParams.get("metric");
  if (!metric) return NextResponse.json({ error: "metric is required" }, { status: 400 });

  const db = pdDb();
  await db.from("pd_board_points").delete().eq("board_id", id).eq("metric", metric);
  await db.from("pd_board_series").delete().eq("board_id", id).eq("metric", metric);
  return NextResponse.json({ ok: true });
}
