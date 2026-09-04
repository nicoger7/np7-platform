import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

/**
 * Who changed what, in the finance tables.
 *
 * The API holds the service role, so a database trigger could see the change
 * but never the person behind it. The routes know, so the routes record it.
 *
 * Deliberately best-effort: an audit write that fails must never take the
 * change down with it. A missing audit row is a gap in the record; a refused
 * save because the record could not be written is a worse outcome for
 * everyone, and the change itself is still in the table it belongs to.
 */

export type AuditAction = "insert" | "update" | "delete";

type Actor = { id: string | null; name: string | null };

/** The team member behind this request, or an honest blank. */
export async function currentActor(): Promise<Actor> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, name: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    let { data } = await db.from("team_members").select("id,name").eq("auth_user_id", user.id).maybeSingle();
    if (!data && user.email) {
      const byEmail = await db.from("team_members").select("id,name").ilike("email", user.email).maybeSingle();
      data = byEmail.data;
    }
    return { id: data?.id ?? null, name: data?.name ?? user.email ?? null };
  } catch {
    return { id: null, name: null };
  }
}

/** Only the fields that actually moved, so the record reads as a change and
 *  not as a copy of the row. */
export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { before: Record<string, unknown>; after: Record<string, unknown>; keys: string[] } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys: string[] = [];
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (k === "updated_at" || k === "created_at") continue;
    const bv = before?.[k], av = after?.[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    b[k] = bv ?? null; a[k] = av ?? null; keys.push(k);
  }
  return { before: b, after: a, keys };
}

export async function recordChange(input: {
  table: string;
  rowId?: string | null;
  action: AuditAction;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor?: Actor;
}): Promise<void> {
  try {
    const actor = input.actor ?? (await currentActor());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const diff = input.action === "update"
      ? changedFields(input.before ?? null, input.after ?? null)
      : { before: input.before ?? null, after: input.after ?? null, keys: [] };
    // Nothing actually moved: recording it would only make the history noisier.
    if (input.action === "update" && diff.keys.length === 0) return;
    await db.from("fin_audit").insert({
      table_name: input.table,
      row_id: input.rowId ?? null,
      action: input.action,
      actor_id: actor.id,
      actor_name: actor.name,
      summary: input.summary,
      before: diff.before,
      after: diff.after,
    });
  } catch {
    /* see the note at the top: never take the change down with the record of it */
  }
}
