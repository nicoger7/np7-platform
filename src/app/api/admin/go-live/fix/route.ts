import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Fill in one field straight from the readiness list.
 *
 * The point of the checklist is to work through it, and bouncing out to a
 * different page for a one-line field is where that stalls. So the simple ones
 * are editable in place.
 *
 * The client sends a table and a column, so both are whitelisted here — nothing
 * that arrives in the body decides what gets written. Anything not in this map
 * has no inline editor and links out to its real editor instead.
 */
const ALLOWED: Record<string, "text" | "number"> = {
  "exp_experiences.location": "text",
  "exp_experiences.description": "text",
  "exp_experiences.cancellation_policy": "text",
  "exp_editions.max_spots": "number",
  "exp_editions.deposit": "number",
  "exp_editions.whatsapp_group_link": "text",
  "exp_content.packing_list": "text",
};

export async function PATCH(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const table = String(body?.table ?? "");
  const column = String(body?.column ?? "");
  const id = String(body?.id ?? "");
  const kind = ALLOWED[`${table}.${column}`];

  if (!kind) return NextResponse.json({ error: "That field can't be edited here." }, { status: 400 });
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  let value: string | number | null;
  if (kind === "number") {
    const raw = body?.value;
    if (raw === null || raw === undefined || String(raw).trim() === "") value = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Enter a number." }, { status: 400 });
      value = n;
    }
  } else {
    const raw = typeof body?.value === "string" ? body.value.trim() : "";
    value = raw === "" ? null : raw;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // exp_content has at most one row per experience and may not exist yet, so the
  // id we're given is the experience's — upsert on that unique column.
  const { error } = table === "exp_content"
    ? await db.from("exp_content").upsert({ experience_id: id, [column]: value }, { onConflict: "experience_id" })
    : await db.from(table).update({ [column]: value }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, value });
}
