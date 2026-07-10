import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { createApplication, getMemberApplication, type MediaKind } from "@/lib/signature";

export const runtime = "nodejs";

// POST /api/signature/apply — apply for a Signature Trip.
// ACCOUNT-REQUIRED (Nico: a barrier for a premium invite-only trip). The
// applicant must be signed in; the application ties to their contact and they
// see its status in their portal. One live application per member.
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Please log in or create an account to apply." }, { status: 401 });

  const existing = await getMemberApplication(user.contactId);
  if (existing) return NextResponse.json({ alreadyApplied: true, status: existing.status, error: "You've already applied — we'll be in touch." }, { status: 409 });

  // Identity comes from the account (authoritative), not the form.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: contact } = await db.from("contacts").select("name,email,phone").eq("id", user.contactId).maybeSingle();

  const b = await request.json().catch(() => ({}));
  const media = b.media && (b.media.kind === "video" || b.media.kind === "audio") && typeof b.media.contentType === "string"
    ? { kind: b.media.kind as MediaKind, contentType: b.media.contentType as string }
    : null;

  const res = await createApplication({
    contactId: user.contactId,
    name: (contact?.name as string) || (typeof b.name === "string" ? b.name : "") || "Member",
    email: (contact?.email as string) || (typeof b.email === "string" ? b.email : ""),
    phone: (typeof b.phone === "string" && b.phone.trim()) || (contact?.phone as string) || null,
    level: typeof b.level === "string" ? b.level : null,
    wants: typeof b.wants === "string" ? b.wants.slice(0, 4000) : null,
    motivation: typeof b.motivation === "string" ? b.motivation.slice(0, 4000) : null,
    media,
  });

  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ id: res.id, uploadUrl: res.uploadUrl });
}
