/**
 * Spotguide facts about one member, for the member home.
 *
 * Nico, 6 Oct 2026: the setup checklist on /account listed only trip steps
 * (level, T-shirt, @handle), so a rider who joined from the spotguide was never
 * pointed back at the thing they joined for. "Add your home spot" is a step now,
 * done once they have submitted a spot of their own.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase";

/**
 * Has this member ever submitted a spot (pending, live or since removed)?
 * null when the question could not be answered: the caller leaves the step
 * out rather than nag a rider who may well have done it.
 */
export async function memberHasAddedSpot(contactId: string): Promise<boolean | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createAdminClient() as any;
    const { count, error } = await sb.from("spots")
      .select("id", { count: "exact", head: true })
      .eq("submitted_by", contactId).eq("source", "member");
    if (error) return null;
    return (count ?? 0) > 0;
  } catch {
    return null;
  }
}
