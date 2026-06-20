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

export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  const { data, error } = await client.from("team_members").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
