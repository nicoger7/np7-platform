import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess, requireAdminGate } from "@/lib/admin-auth";
/** Candidate/confirmed dates for an event experience. Admin-only. */
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  if (!(await getRequestAccess())) return bad("Not authorised.", 401);
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  if (!experienceId) return bad("Missing experienceId.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_event_dates").select("*").eq("experience_id", experienceId).order("sort_order").order("date_start");
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  if (!(await getRequestAccess())) return bad("Not authorised.", 401);
  const body = await request.json().catch(() => ({}));
  const { experienceId, date_start, date_end, label } = body;
  if (!experienceId || !date_start) return bad("Missing event or start date.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: existing } = await db.from("exp_event_dates").select("sort_order").eq("experience_id", experienceId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("exp_event_dates").insert({
    experience_id: experienceId, date_start, date_end: date_end || null, label: label || null,
    status: "candidate", sort_order: (existing?.sort_order ?? -1) + 1,
  }).select().single();
  if (error) return bad(error.message, 500);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  if (!(await getRequestAccess())) return bad("Not authorised.", 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return bad("Missing id.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("exp_event_dates").delete().eq("id", id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
