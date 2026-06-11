import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Audit/identity fields that should never be copied into a duplicate.
const STRIP = new Set(["id", "created_at", "updated_at", "notion_id", "slug"]);

/**
 * Generic "duplicate a row" handler used by every CRUD resource's
 * POST /[id]/duplicate route. Copies all data columns, strips identity/audit
 * fields, suffixes the title field with " (copy)".
 */
export async function duplicateRow(
  table: string,
  id: string,
  opts: { nameField?: string; select?: string } = {}
) {
  const { nameField = "name", select = "*" } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;

  const { data: original, error } = await client.from(table).select("*").eq("id", id).single();
  if (error || !original) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(original)) {
    if (!STRIP.has(k)) copy[k] = v;
  }
  if (typeof copy[nameField] === "string") copy[nameField] = `${copy[nameField]} (copy)`;

  const { data, error: insErr } = await client.from(table).insert(copy).select(select).single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
