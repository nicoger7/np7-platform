import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET() {
  const client = createAdminClient();
  const { data, error } = await client.from("team_members").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Computed: total_hours (sum of logged hours) + total_cost (× rate)
  const { data: hours } = await client.from("hours_log").select("employee_id, hours");
  const hoursByMember: Record<string, number> = {};
  for (const h of (hours || []) as { employee_id: string | null; hours: number | null }[]) {
    if (h.employee_id) hoursByMember[h.employee_id] = (hoursByMember[h.employee_id] || 0) + (Number(h.hours) || 0);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (data || []).map((m: any) => {
    const total_hours = Math.round((hoursByMember[m.id] || 0) * 10) / 10;
    const total_cost = m.rate_per_hour != null ? Math.round(total_hours * Number(m.rate_per_hour) * 100) / 100 : null;
    return { ...m, total_hours, total_cost };
  });
  return NextResponse.json(enriched);
}

// role_ids arrives with migration 045 — strip & retry if the column isn't there
// yet, so creating a team member still works pre-migration (mirrors PATCH).
const PENDING_OPTIONAL = ["role_ids"];

export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (payload: Record<string, unknown>) => (client as any).from("team_members").insert(payload).select().single();
  let { data, error } = await run(body);
  if (error && PENDING_OPTIONAL.some((k) => k in body) && /column .* does not exist|schema cache|could not find/i.test(error.message)) {
    const stripped = Object.fromEntries(Object.entries(body).filter(([k]) => !PENDING_OPTIONAL.includes(k)));
    ({ data, error } = await run(stripped));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
