import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { ensureMemberAccount } from "@/lib/members";
import { sendEmail } from "@/lib/email/send";
import { createApplication, getMemberApplication, findOrCreateContact, type MediaKind } from "@/lib/signature";

export const runtime = "nodejs";

// POST /api/signature/apply — apply for a Signature Trip.
// Two paths, both end in a REAL (verified) application tied to an NP7 account:
//  • logged-in member → application saved verified immediately.
//  • guest → application saved UNVERIFIED + we email a magic login link; clicking
//    it logs them in and flips the application to verified ("makes it real").
// A verified application is required to be considered — a fake email never verifies.
export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const media = b.media && (b.media.kind === "video" || b.media.kind === "audio") && typeof b.media.contentType === "string"
    ? { kind: b.media.kind as MediaKind, contentType: b.media.contentType as string }
    : null;
  const level = typeof b.level === "string" ? b.level : null;
  const wants = typeof b.wants === "string" ? b.wants.slice(0, 4000) : null;
  const motivation = typeof b.motivation === "string" ? b.motivation.slice(0, 4000) : null;
  const phone = typeof b.phone === "string" ? b.phone : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);

  // ── logged-in member: verified straight away ──
  if (user) {
    if (await getMemberApplication(user.contactId)) {
      return NextResponse.json({ alreadyApplied: true, error: "You've already applied — we'll be in touch." }, { status: 409 });
    }
    const { data: contact } = await db.from("contacts").select("name,email,phone").eq("id", user.contactId).maybeSingle();
    const res = await createApplication({
      contactId: user.contactId, verified: true,
      name: (contact?.name as string) || "Member",
      email: (contact?.email as string) || "",
      phone: (phone?.trim()) || (contact?.phone as string) || null,
      level, wants, motivation, media,
    });
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ id: res.id, uploadUrl: res.uploadUrl, verified: true });
  }

  // ── guest: create unverified + email a magic link to confirm ──
  const email = (typeof b.email === "string" ? b.email : "").trim().toLowerCase();
  const name = (typeof b.name === "string" ? b.name : "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter your name and a valid email." }, { status: 400 });
  }
  const contactId = await findOrCreateContact(email, name);
  if (!contactId) return NextResponse.json({ error: "Could not submit — please try again." }, { status: 500 });

  // Already have a verified application on this email? Nothing more to do.
  const { data: prior } = await db.from("exp_trip_applications").select("id,verified").eq("contact_id", contactId).is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (prior?.verified) return NextResponse.json({ alreadyApplied: true, error: "You've already applied with this email — we'll be in touch." }, { status: 409 });

  const res = await createApplication({
    contactId, verified: false,
    name: name || email.split("@")[0], email,
    phone: phone?.trim() || null, level, wants, motivation, media,
  });
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });

  // email the magic login link — clicking it verifies the application.
  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  const acc = await ensureMemberAccount({ contactId, email, origin, next: "/signature" });
  if ("link" in acc) {
    await sendEmail({
      to: email, templateKey: "account_magic_link",
      vars: { firstName: name.split(" ")[0] || undefined, activationLink: acc.link },
      contactId, dedupeKey: `signature:${contactId}:${Date.now()}`,
    }).catch(() => {});
  }
  return NextResponse.json({ id: res.id, uploadUrl: res.uploadUrl, needsVerification: true, email });
}
