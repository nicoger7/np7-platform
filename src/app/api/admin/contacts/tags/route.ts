import { NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/contacts/tags — every contact tag with its live count (emailable,
// non-archived contacts only). Feeds tag autocompletes (survey invites etc.).
export async function GET() {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("contact_tag_counts").select("*").order("count", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data ?? [] });
}
