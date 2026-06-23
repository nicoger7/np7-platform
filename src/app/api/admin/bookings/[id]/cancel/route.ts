import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

/**
 * Admin-confirmed cancellation. Cancellations are ALWAYS confirmed by the team
 * (never auto): this sets the booking to "lost", stamps a note, and emails the
 * member a confirmation. Refunds/credits are handled personally — not here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: b } = await db
    .from("exp_bookings")
    .select("id,status,notes,contact_id,experience_id,contacts(name,email),exp_experiences(title),exp_editions(date_start,date_end)")
    .eq("id", id)
    .maybeSingle();
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const note = `[CANCELLATION CONFIRMED ${stamp} by team]`;
  const notes = b.notes ? `${b.notes}\n${note}` : note;
  const { error } = await db.from("exp_bookings").update({ status: "lost", notes }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Email the member (best-effort — never fails the cancellation).
  if (b.contacts?.email) {
    const s = b.exp_editions?.date_start as string | null;
    const e = b.exp_editions?.date_end as string | null;
    const fmt = (x: string) => new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const dates = s ? (e ? `${fmt(s)} – ${fmt(e)} ${new Date(e).getFullYear()}` : `${fmt(s)} ${new Date(s).getFullYear()}`) : undefined;
    await sendEmail({
      to: b.contacts.email,
      templateKey: "cancellation_confirmed",
      vars: { firstName: String(b.contacts.name ?? "").split(" ")[0] || "there", experienceTitle: b.exp_experiences?.title, dates },
      bookingId: id,
      contactId: b.contact_id,
      dedupeKey: `cancellation_confirmed:${id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
