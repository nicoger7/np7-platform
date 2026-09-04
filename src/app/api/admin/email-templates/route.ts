import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { AUTOMATIONS } from "@/lib/email/automations";
import { requireAdminGate } from "@/lib/admin-auth";
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");

  // Ensure the 10 lifecycle emails always exist as editable rows (independent of
  // whether the seed migration has run) so they show up and can be edited.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = client as any;
  const { data: existing } = await adb.from("email_templates").select("template_key");
  const have = new Set((existing || []).map((r: { template_key: string | null }) => r.template_key).filter(Boolean));
  const missing = AUTOMATIONS.filter((a) => !have.has(a.key)).map((a) => ({ template_key: a.key, name: a.name, active: true }));
  if (missing.length) await adb.from("email_templates").insert(missing);

  let query = client.from("email_templates").select("*, exp_experiences:experience_id(id, title)").order("name");
  if (experienceId) query = query.eq("experience_id", experienceId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const body = await request.json();
  const { data, error } = await client.from("email_templates").insert(body).select("*, exp_experiences:experience_id(id, title)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
