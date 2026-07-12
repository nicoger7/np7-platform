import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { unsubscribeToken } from "@/lib/email/campaign";

/**
 * Public one-click unsubscribe. GET /api/unsubscribe?c=<contactId>&t=<hmac>
 * Also accepts POST (Gmail's List-Unsubscribe-Post one-click hits it with POST).
 * Sets marketing_opt_in = false (+ legacy accepts_marketing mirror). The token is
 * an HMAC of the contact id, so links can't be forged or enumerated.
 */
async function unsubscribe(req: NextRequest): Promise<NextResponse> {
  const c = req.nextUrl.searchParams.get("c") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  const ok = c && t && t === unsubscribeToken(c);
  if (ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    await db.from("contacts").update({
      marketing_opt_in: false,
      accepts_marketing: false,
      marketing_opt_in_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", c);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NP7 · Unsubscribed</title></head>
<body style="margin:0;background:#eef3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:64px auto;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(0,55,74,0.08);overflow:hidden;">
  <div style="height:5px;background:linear-gradient(90deg,#ffc42e 0%,#f47b20 48%,#00afdb 100%);"></div>
  <div style="padding:36px 32px;color:#33434a;">
    ${ok
      ? `<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">You're unsubscribed 👋</h1>
         <p style="margin:0 0 8px;line-height:1.6;">You won't receive marketing emails from NP7 anymore. Booking and account emails still reach you when needed.</p>
         <p style="margin:0;line-height:1.6;color:#5a6b72;">Changed your mind? Just reply to any of our emails or write to experience@np-seven.com.</p>`
      : `<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">This link isn't valid</h1>
         <p style="margin:0;line-height:1.6;">The unsubscribe link looks incomplete or expired. Email experience@np-seven.com and we'll take you off the list right away.</p>`}
  </div>
  <div style="background:#00374a;padding:16px 32px;color:#9fb3bb;font-size:12px;">NP7 GmbH · Germany</div>
</div></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) { return unsubscribe(req); }
export async function POST(req: NextRequest) { return unsubscribe(req); }
