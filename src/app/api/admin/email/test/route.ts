import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/email/test  { to }
 * Sends a one-off connectivity test straight through Resend (bypassing the template
 * pipeline) so you can confirm the API key + verified sender domain work before the
 * lifecycle cron starts delivering. Admin-only (enforced by middleware).
 */
export async function POST(req: NextRequest) {
  let to = "";
  try {
    ({ to } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "NP7 Experience <hello@np-seven.com>";
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY isn't set yet. Add it (and EMAIL_FROM) to the Vercel env, then redeploy." },
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
        subject: "NP7 email test ✅",
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:28px">
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
