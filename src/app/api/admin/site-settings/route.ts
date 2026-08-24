import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Site-wide content knobs (site_settings, migration 176). Authz: the admin
 * middleware — this path is registered under the `templates` section, so
 * view-only roles read and edit roles write, like every other section.
 */
export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("site_settings").select("value, updated_at").eq("key", key).maybeSingle();
  return NextResponse.json({ value: data?.value ?? null, updated_at: data?.updated_at ?? null });
}

export async function PUT(request: NextRequest) {
  let body: { key?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.key || body.value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("site_settings").upsert({ key: body.key, value: body.value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
