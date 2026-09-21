import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { TEAM_EVENTS } from "@/lib/email/team-alerts";

/**
 * Admin → Emails → Team: add, remove and switch internal recipients.
 *
 * The event key is checked against the registry in code rather than taken on
 * trust: a subscription to an event nothing sends is a row that looks like a
 * promise and keeps none.
 */
export const dynamic = "force-dynamic";

const KEYS = new Set(TEAM_EVENTS.map((e) => e.key as string));

export async function POST(req: Request) {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  if (body.action === "add") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const eventKey = String(body.eventKey ?? "");
    if (!KEYS.has(eventKey)) return NextResponse.json({ error: "Unknown notification." }, { status: 400 });
    if (!email.includes("@")) return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
    const { data, error } = await db.from("team_mail_recipients")
      .insert({ event_key: eventKey, email, name: body.name ? String(body.name) : null })
      .select("id,event_key,email,name,enabled").single();
    if (error) {
      // the unique index doing its job: they are already on this one
      const already = String(error.message ?? "").toLowerCase().includes("duplicate");
      return NextResponse.json({ error: already ? "They are already on this one." : error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, recipient: data });
  }

  if (body.action === "toggle") {
    const { error } = await db.from("team_mail_recipients")
      .update({ enabled: body.enabled === true, updated_at: new Date().toISOString() })
      .eq("id", String(body.id ?? ""));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove") {
    const { error } = await db.from("team_mail_recipients").delete().eq("id", String(body.id ?? ""));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
