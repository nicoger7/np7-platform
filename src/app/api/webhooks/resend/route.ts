import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Resend delivery events → email_log. Secured by a shared key in the URL
 * (?key=RESEND_WEBHOOK_KEY): forging events could only repaint delivery
 * badges, never send mail or read anything.
 *
 * Records: opened_at (first open) + last_event (delivered → opened, with
 * bounced/complained ranked terminal so a late 'delivered' can't mask them).
 */

const RANK: Record<string, number> = { sent: 0, delivered: 1, opened: 2, clicked: 3, bounced: 9, complained: 9 };

export async function POST(request: NextRequest) {
  const key = process.env.RESEND_WEBHOOK_KEY;
  if (!key || request.nextUrl.searchParams.get("key") !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const type: string = body?.type ?? "";
  const emailId: string | undefined = body?.data?.email_id;
  const event = type.replace(/^email\./, ""); // email.opened → opened
  if (!emailId || !(event in RANK)) return NextResponse.json({ ok: true, ignored: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: row } = await db.from("email_log").select("id, opened_at, last_event").eq("provider_id", emailId).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, unknown: true }); // e.g. dashboard test sends

  const patch: Record<string, unknown> = {};
  if ((event === "opened" || event === "clicked") && !row.opened_at) {
    patch.opened_at = body?.created_at ?? new Date().toISOString();
  }
  if ((RANK[event] ?? 0) >= (RANK[row.last_event ?? "sent"] ?? 0)) {
    patch.last_event = event;
  }
  if (Object.keys(patch).length) await db.from("email_log").update(patch).eq("id", row.id);
  return NextResponse.json({ ok: true });
}
