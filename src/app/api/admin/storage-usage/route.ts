import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase";
import { isActiveTeamMember } from "@/lib/admin-auth";

/**
 * How much is actually in storage.
 *
 * Read from `storage.objects` rather than by listing the bucket: the sizes are
 * already recorded there, so this is one aggregate query instead of walking
 * thousands of keys — and it stays fast as the library grows, which a listing
 * would not.
 *
 * Returns the whole bucket broken down by top-level folder, so "memories" can
 * be shown on its own without a second round trip.
 */
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin.rpc("storage_usage_by_folder");
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map((r) => ({
      folder: String(r.folder ?? ""),
      files: Number(r.files ?? 0),
      bytes: Number(r.bytes ?? 0),
    }));
    const total = rows.reduce((a, r) => ({ files: a.files + r.files, bytes: a.bytes + r.bytes }), { files: 0, bytes: 0 });
    return Response.json({ folders: rows, total });
  } catch {
    // Never break the page over a usage read-out.
    return Response.json({ folders: [], total: null });
  }
}
