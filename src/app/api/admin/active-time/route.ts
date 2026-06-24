import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getHoursActor } from "@/lib/hours-auth";

const IDLE_SECONDS = 5 * 60;       // pause the clock after 5 min of no activity
const DAY_CAP = 10 * 60 * 60;      // never auto-suggest more than 10h/day
const FLOOR_SECONDS = 15 * 60;     // ignore days under 15 min

function tableMissing(msg?: string | null) {
  return !!msg && /(staff_active_time|does not exist|schema cache|relation)/i.test(msg);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

// POST — a heartbeat. Accumulates the gap since the last ping if it's within the
// idle window (so idle time and closed-tab gaps don't count).
export async function POST(request: NextRequest) {
  const actor = await getHoursActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const date = (body.date as string) || todayISO();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  try {
    const { data: row } = await db.from("staff_active_time").select("active_seconds, last_ping_at").eq("employee_id", actor.id).eq("date", date).maybeSingle();
    const now = new Date();
    let add = 0;
    if (row?.last_ping_at) {
      const gap = (now.getTime() - new Date(row.last_ping_at).getTime()) / 1000;
      if (gap > 0 && gap <= IDLE_SECONDS) add = gap;
    }
    const active_seconds = Math.min(DAY_CAP, Math.round((row?.active_seconds ?? 0) + add));
    const { error } = await db.from("staff_active_time").upsert(
      { employee_id: actor.id, date, active_seconds, last_ping_at: now.toISOString(), updated_at: now.toISOString() },
      { onConflict: "employee_id,date" }
    );
    if (error) { if (tableMissing(error.message)) return NextResponse.json({ disabled: true }); throw error; }
    return NextResponse.json({ active_seconds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (tableMissing(msg)) return NextResponse.json({ disabled: true });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET — the member's unconfirmed tracked time (today + any earlier days they
// haven't logged), for the Hours Log "log your tracked time" suggestion.
export async function GET() {
  const actor = await getHoursActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  try {
    const { data, error } = await db
      .from("staff_active_time")
      .select("date, active_seconds")
      .eq("employee_id", actor.id)
      .is("confirmed_at", null)
      .gte("active_seconds", FLOOR_SECONDS)
      .order("date", { ascending: false });
    if (error) { if (tableMissing(error.message)) return NextResponse.json({ pending: [] }); throw error; }
    return NextResponse.json({ pending: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (tableMissing(msg)) return NextResponse.json({ pending: [] });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — mark a day's tracked time as confirmed (logged or dismissed) so it
// stops being suggested.
export async function PATCH(request: NextRequest) {
  const actor = await getHoursActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const date = (body.date as string) || todayISO();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("staff_active_time").update({ confirmed_at: new Date().toISOString() }).eq("employee_id", actor.id).eq("date", date);
  if (error && !tableMissing(error.message)) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
