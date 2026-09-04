import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isLevel } from "@/lib/member-level";
import { requireAdminGate } from "@/lib/admin-auth";
/**
 * POST /api/admin/members/:id/congrats — email a member to congratulate them on
 * a newly-verified level. Sent directly via Resend (a one-off, admin-triggered
 * note — not part of the gated lifecycle pipeline). No-ops cleanly if Resend
 * isn't configured.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const level = isLevel(body.level) ? body.level : null;
  if (!level) return NextResponse.json({ error: "Unknown level." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: c } = await db.from("contacts").select("name, email").eq("id", id).maybeSingle();
  if (!c?.email) return NextResponse.json({ error: "No email on file." }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, skipped: "no RESEND_API_KEY" });

  const first = (c.name ?? "").split(" ")[0] || "there";
  const subject = `You're now ${level} — nice work! 🤙`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#00374a">
    <h1 style="font-size:22px;margin:0 0 12px">Congrats, ${first}! 🎉</h1>
    <p style="font-size:15px;line-height:1.6;color:#3f5158">Your NP7 coach just verified you at <b>${level}</b>. That's real progress on the water — keep it up.</p>
    <p style="font-size:15px;line-height:1.6;color:#3f5158">See your skills and what's next in your NP7 area.</p>
    <p style="margin:20px 0"><a href="https://www.np-seven.com/account/level" style="background:#00afdb;color:#fff;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:999px;font-size:14px">View my progress →</a></p>
    <p style="font-size:13px;color:#9aa6ac">— Nico &amp; the NP7 crew</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "NP7 <experience@np-seven.com>", to: c.email, reply_to: "experience@np-seven.com", subject, html }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: json?.message || "Send failed." }, { status: 502 });
    // This note sends outside the templated lifecycle pipeline, so record it here
    // too — otherwise it never shows in the Email Log or the member's Emails tab.
    await db.from("email_log").insert({
      template_key: "level_congrats",
      contact_id: id,
      to_email: c.email,
      subject,
      status: "sent",
      provider_id: json?.id ?? null,
      sent_at: new Date().toISOString(),
    }).then(() => {}, () => {}); // best-effort — never fail the send on a log hiccup
  } catch {
    return NextResponse.json({ error: "Send failed." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
