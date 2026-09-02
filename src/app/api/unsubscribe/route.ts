import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { unsubscribeToken } from "@/lib/email/campaign";

/**
 * Public unsubscribe. /api/unsubscribe?c=<contactId>&t=<hmac>
 *
 * The token is an HMAC of the contact id, so links can't be forged or
 * enumerated — but it was the GET that did the unsubscribing, and a link in an
 * email is fetched by things that are not the recipient. A corporate mail
 * gateway walking an incoming newsletter would have opted that contact out
 * before they read a word of it, silently, with 14,768 contacts on the list and
 * nothing in the product to tell us it had happened.
 *
 * So GET now only asks. The POST still does the work, which is also what RFC
 * 8058 one-click needs: Gmail and friends send List-Unsubscribe-Post as a POST
 * and must keep working untouched, and no scanner posts a form.
 */

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NP7 · Email settings</title></head>
<body style="margin:0;background:#eef3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:64px auto;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(0,55,74,0.08);overflow:hidden;">
  <div style="height:5px;background:linear-gradient(90deg,#ffc42e 0%,#f47b20 48%,#00afdb 100%);"></div>
  <div style="padding:36px 32px;color:#33434a;">${body}</div>
  <div style="background:#00374a;padding:16px 32px;color:#9fb3bb;font-size:12px;">NP7 GmbH · Germany</div>
</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

const INVALID = `<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">This link isn't valid</h1>
  <p style="margin:0;line-height:1.6;">The unsubscribe link looks incomplete or expired. Email experience@np-seven.com and we'll take you off the list right away.</p>`;

const valid = (req: NextRequest) => {
  const c = req.nextUrl.searchParams.get("c") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  return c && t && t === unsubscribeToken(c) ? c : null;
};

/** GET: ask. Nothing is written here, whoever is fetching. */
export async function GET(req: NextRequest) {
  const c = valid(req);
  if (!c) return page(INVALID, 400);
  const action = `/api/unsubscribe?c=${encodeURIComponent(c)}&t=${encodeURIComponent(req.nextUrl.searchParams.get("t") || "")}`;
  return page(`<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">Unsubscribe from NP7 emails?</h1>
    <p style="margin:0 0 20px;line-height:1.6;">Press the button and you're off the marketing list. Booking and account emails still reach you when needed.</p>
    <form method="POST" action="${action}" style="margin:0;">
      <button type="submit" style="width:100%;border:0;border-radius:12px;background:#00374a;color:#fff;font-size:15px;font-weight:700;padding:14px;cursor:pointer;">Yes, unsubscribe me</button>
    </form>
    <p style="margin:18px 0 0;line-height:1.6;color:#5a6b72;font-size:13px;">Nothing happens until you press it, so a link checker opening this page can't take you off the list.</p>`);
}

/** POST: do it. Both the button above and RFC 8058 one-click land here. */
export async function POST(req: NextRequest) {
  const c = valid(req);
  if (!c) return page(INVALID, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  await db.from("contacts").update({
    marketing_opt_in: false,
    accepts_marketing: false,
    marketing_opt_in_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", c);

  return page(`<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">You're unsubscribed 👋</h1>
    <p style="margin:0 0 8px;line-height:1.6;">You won't receive marketing emails from NP7 anymore. Booking and account emails still reach you when needed.</p>
    <p style="margin:0;line-height:1.6;color:#5a6b72;">Changed your mind? Just reply to any of our emails or write to experience@np-seven.com.</p>`);
}
