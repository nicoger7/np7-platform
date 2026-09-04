import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/components — list components
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");
  const editionId = searchParams.get("edition_id");
  const category = searchParams.get("category");
  const globalOnly = searchParams.get("global");

  // Try with the edition embed (needs migration 016); fall back without it.
  const buildQuery = (withEdition: boolean) => {
    let q = client
      .from("exp_components")
      .select(withEdition
        ? "*, exp_experiences(id, title), edition:edition_id(id, year, label)"
        : "*, exp_experiences(id, title)")
      .order("category")
      .order("name");
    // Relevant set for a package's "what's included" picker:
    //  • always global components, plus
    //  • this experience's components — and when an edition is given, only those
    //    scoped to that edition or not edition-scoped at all (experience-wide).
    if (experienceId && editionId && withEdition) {
      q = q.or(`is_global.eq.true,and(experience_id.eq.${experienceId},or(edition_id.eq.${editionId},edition_id.is.null)),and(experience_id.is.null,edition_id.is.null)`);
    } else if (experienceId) {
      q = q.or(`is_global.eq.true,experience_id.eq.${experienceId},experience_id.is.null`);
    }
    if (globalOnly === "true") q = q.eq("is_global", true);
    if (category) q = q.eq("category", category);
    return q;
  };

  let { data, error } = await buildQuery(true);
  if (error) ({ data, error } = await buildQuery(false));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(notArchived(data));
}

// POST /api/admin/components — create a component
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const body = await request.json();

  let { data, error } = await client
    .from("exp_components")
    .insert(body)
    .select("*, exp_experiences(id, title)")
    .single();

  // Pre-migration fallback: retry without edition_id if the column is missing
  if (error && /edition_id/.test(error.message) && "edition_id" in body) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { edition_id: _omit, ...rest } = body;
    ({ data, error } = await client
      .from("exp_components")
      .insert(rest)
      .select("*, exp_experiences(id, title)")
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
