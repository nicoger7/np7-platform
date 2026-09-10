import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { cleanKeywords } from "@/lib/flag-store";

/**
 * Flags the team can add without a deploy (migration 234).
 *
 * Lives under /api/admin/promo deliberately: access.ts already gives that whole
 * prefix to the `promo` section, so this route is gated the moment it exists.
 * A new top-level section would have been a new hole, because both gates in
 * that file fail OPEN for a path nobody registered.
 */

// GET /api/admin/promo/flags — every live custom flag
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_flags")
    .select("id, code, name, src, keywords, sort, updated_at")
    .is("archived_at", null)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  // Tolerate the table not existing yet: the bundled flags still work, and an
  // empty list beats a picker that will not open.
  if (error) return NextResponse.json([]);
  return NextResponse.json(data);
}

// POST /api/admin/promo/flags — add one
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A flag needs a name." }, { status: 400 });
  // The handle is only ever seen in a URL and in saved design state, so derive
  // it from the name rather than asking for one more field nobody understands.
  const code = (String(body.code ?? "").trim() || name)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "flag";
  const src = String(body.src ?? "").trim() || null;
  if (!src) return NextResponse.json({ error: "Pick an image for the flag." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_flags")
    .insert({ code, name: name.slice(0, 60), src, keywords: cleanKeywords(body.keywords), sort: Number(body.sort) || 0 })
    .select("id, code, name, src, keywords, sort")
    .single();
  if (error) {
    const dupe = /duplicate key|exp_flags_code_live/i.test(error.message);
    return NextResponse.json(
      { error: dupe ? `There is already a flag called "${code}".` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}
