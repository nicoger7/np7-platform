import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { notArchived } from "@/lib/archive";

// POST /api/admin/editions/:id/copy-packages  { fromEditionId }
// Clones every package of another edition (with its component links) into this
// edition — for spinning up a new week from last year's set in one click.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id: targetEditionId } = await params;
  const { fromEditionId } = await request.json().catch(() => ({}));
  if (!fromEditionId || fromEditionId === targetEditionId) {
    return NextResponse.json({ error: "Pick a different source edition." }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: target, error: tErr } = await db.from("exp_editions").select("id, experience_id").eq("id", targetEditionId).single();
  if (tErr || !target) return NextResponse.json({ error: "Target edition not found" }, { status: 404 });

  const { data: srcPkgs } = await db.from("exp_packages").select("*").eq("edition_id", fromEditionId);
  const packages = notArchived(srcPkgs) as Record<string, unknown>[];
  if (!packages.length) return NextResponse.json({ copied: 0 });

  let copied = 0;
  let lastError: string | null = null;
  for (const p of packages) {
    const { id: srcId, created_at, updated_at, notion_id, slug, ...rest } = p as Record<string, unknown> & { id: string };
    void created_at; void updated_at; void notion_id; void slug;
    // slug is NOT NULL + unique — derive a fresh one from the name (same
    // recipe as the package duplicate route). Inserting null here made every
    // copy fail silently, which read as "the button does nothing".
    const name = String(rest.name ?? "package");
    const freshSlug = `${name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: copy, error: cErr } = await db
      .from("exp_packages")
      .insert({ ...rest, edition_id: targetEditionId, experience_id: target.experience_id, slug: freshSlug })
      .select("id")
      .single();
    if (cErr || !copy) { lastError = cErr?.message ?? lastError; continue; }
    const { data: links } = await db.from("exp_package_components").select("component_id, quantity, notes").eq("package_id", srcId);
    if (links && links.length) {
      await db.from("exp_package_components").insert(links.map((l: Record<string, unknown>) => ({ ...l, package_id: copy.id })));
    }
    copied += 1;
  }
  // partial/total failure is not a success — surface what went wrong
  if (!copied && lastError) return NextResponse.json({ error: `Copy failed: ${lastError}` }, { status: 500 });
  return NextResponse.json({ copied, ...(lastError ? { warning: `Some packages failed: ${lastError}` } : {}) });
}
