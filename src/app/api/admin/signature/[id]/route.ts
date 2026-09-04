import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { updateApplication, archiveApplication, type ApplicationStatus } from "@/lib/signature";
import { requireAdminGate } from "@/lib/admin-auth";
export const runtime = "nodejs";

const STATUSES = new Set<ApplicationStatus>(["new", "shortlisted", "accepted", "declined"]);

// PATCH /api/admin/signature/:id — set status and/or admin notes.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const b = await request.json().catch(() => ({}));
  const patch: { status?: ApplicationStatus; admin_notes?: string } = {};
  if (typeof b.status === "string" && STATUSES.has(b.status as ApplicationStatus)) patch.status = b.status as ApplicationStatus;
  if (typeof b.admin_notes === "string") patch.admin_notes = b.admin_notes.slice(0, 4000);
  const updated = await updateApplication(id, patch);
  if (!updated) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  return NextResponse.json({ application: updated });
}

// DELETE /api/admin/signature/:id — archive (soft delete).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  await archiveApplication(id);
  return NextResponse.json({ ok: true });
}
