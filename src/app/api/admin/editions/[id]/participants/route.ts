import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";

// GET /api/admin/editions/[id]/participants
// Names-only participant list for an edition — used by the Memories uploader so a
// photographer (who has event_content/experiences access but NOT the bookings
// section) can pick who photos are for. Deliberately returns NO money/PII —
// just id + display name.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_bookings")
    .select("id, name, contacts(name)")
    .eq("edition_id", id)
    .neq("status", "lost")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants = (data ?? []).map((b: any) => ({ id: b.id, name: b.name, contact: { name: b.contacts?.name ?? null } }));
  return NextResponse.json({ participants });
}
