import { NextRequest, NextResponse } from "next/server";
import { SENDERS } from "@/lib/email/layout";

/**
 * POST /api/admin/email/test  { to, subject?, html?, division? }
 * With just { to }: a one-off connectivity test (confirms API key + domain).
 * With { subject, html }: sends that rendered draft — used by the template
 * editor's "Send test to me" (the client passes the live preview render).
 * Admin-only (enforced by middleware).
 */
export async function POST(req: NextRequest) {
  let to = "";
  let subject: string | undefined;
  let html: string | undefined;
  let division: "experience" | "hardware" = "experience";
  try {
    const body = await req.json();
    to = body.to;
    subject = typeof body.subject === "string" ? body.subject : undefined;
    html = typeof body.html === "string" ? body.html : undefined;
    if (body.division === "hardware") division = "hardware";
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const { from, replyTo } = SENDERS[division];
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY isn't set yet. Add it to the Vercel env, then redeploy." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        reply_to: replyTo,
        subject: html ? `[TEST] ${subject || "NP7 draft"}` : "NP7 email test ✅",
        html: html ?? `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:28px">
          <h2 style="margin:0 0 8px">It works! 🎉</h2>
          <p style="color:#374151;line-height:1.6;margin:0 0 14px">Resend is wired up and your sender domain is verified — the NP7 email pipeline can deliver.</p>
          <p style="color:#9ca3af;font-size:12px;margin:0">Sent from <code>${from}</code></p>
        </div>`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: json?.message ?? `Resend returned HTTP ${res.status}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: json?.id ?? null, from });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
