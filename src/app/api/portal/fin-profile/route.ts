import { NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { isLevel } from "@/lib/member-level";

export const dynamic = "force-dynamic";

/**
 * GET — the logged-in member's rider profile for the fin selector: their NP7
 * rank mapped onto the tool's three-level scale. Anonymous → 401 (the selector
 * treats that as "ask the questions"). Verified coach level wins over self.
 */
const RANK_TO_SELECTOR: Record<string, "intermediate" | "advanced" | "pro"> = {
  Beginner: "intermediate",
  Intermediate: "intermediate",
  Advanced: "advanced",
  Amateur: "advanced",
  "Semi-Pro": "pro",
  Pro: "pro",
};

export async function GET() {
  const auth = await requirePortalApi({ allowPreview: true });
  if (!auth.ok) return auth.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("contacts")
    .select("level, self_level, level_status, first_name")
    .eq("id", auth.user.contactId)
    .maybeSingle();
  const rank = data?.level_status === "verified" && isLevel(data?.level)
    ? data.level
    : isLevel(data?.self_level) ? data.self_level : isLevel(data?.level) ? data.level : null;
  return NextResponse.json({
    level: rank ? RANK_TO_SELECTOR[rank] ?? null : null,
    rank,
    verified: data?.level_status === "verified",
    firstName: data?.first_name ?? null,
  });
}
