import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");
  let query = client
    .from("scenario_planner")
    .select(
      "*, exp_experiences:experience_id(id, title), beginner_package:beginner_package_id(name, price), mixed_package:mixed_package_id(name, price), pro_package:pro_package_id(name, price)"
    )
    .order("created_at", { ascending: false });
  if (experienceId) query = query.eq("experience_id", experienceId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Computed: total_revenue = Σ(count × package price); margin_pct = profit / revenue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (data || []).map((s: any) => {
    const rev =
      (Number(s.num_beginner) || 0) * (Number(s.beginner_package?.price) || 0) +
      (Number(s.num_mixed) || 0) * (Number(s.mixed_package?.price) || 0) +
      (Number(s.num_pro) || 0) * (Number(s.pro_package?.price) || 0);
    const total_revenue = rev > 0 ? rev : null;
    const profit = s.projected_profit != null
      ? Number(s.projected_profit)
      : (s.projected_revenue != null && s.projected_costs != null ? Number(s.projected_revenue) - Number(s.projected_costs) : null);
    const baseRev = total_revenue ?? (s.projected_revenue != null ? Number(s.projected_revenue) : null);
    const margin_pct = profit != null && baseRev && baseRev > 0 ? Math.round((profit / baseRev) * 1000) / 10 : null;
    return { ...s, total_revenue, margin_pct };
  });
  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  const { data, error } = await client.from("scenario_planner").insert(body).select("*, exp_experiences:experience_id(id, title)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
