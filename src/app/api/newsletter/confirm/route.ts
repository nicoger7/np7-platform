import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { newsletterToken } from "@/lib/email/newsletter";

/**
 * The second half of the double opt-in. /api/newsletter/confirm?c=<id>&t=<hmac>
 *
 * GET only ASKS. The POST does the work.
 *
 * This is the same lesson the unsubscribe route already learned the hard way: a
 * link in an email is fetched by things that are not the recipient, and a
 * corporate mail gateway walks every URL in an incoming message. There, a
 * scanner silently unsubscribed people. Here it would be worse in a way that
 * matters legally: the gateway would "confirm" a consent nobody gave, and NP7
 * would hold a record saying the address confirmed when it never did, which is
 * precisely the proof (Art. 7(1) GDPR) that double opt-in exists to produce.
 *
 * One human click on a button no scanner presses. That is the whole point.
 */

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NP7 · Newsletter</title></head>
<body style="margin:0;background:#eef3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:64px auto;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(0,55,74,0.08);overflow:hidden;">
  <div style="height:5px;background:linear-gradient(90deg,#ffc42e 0%,#f47b20 48%,#00afdb 100%);"></div>
  <div style="padding:36px 32px;color:#33434a;">${body}</div>
  <div style="background:#00374a;padding:16px 32px;color:#9fb3bb;font-size:12px;">NP7 GmbH · Germany</div>
</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

const INVALID = `<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">This link isn't valid</h1>
  <p style="margin:0;line-height:1.6;">The confirmation link looks incomplete or expired. Sign up again at np-seven.com, or email experience@np-seven.com and we'll sort it out.</p>`;

const valid = (req: NextRequest) => {
  const c = req.nextUrl.searchParams.get("c") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  return c && t && t === newsletterToken(c) ? c : null;
};

export async function GET(req: NextRequest) {
  const c = valid(req);
  if (!c) return page(INVALID, 400);
  const action = `/api/newsletter/confirm?c=${encodeURIComponent(c)}&t=${encodeURIComponent(req.nextUrl.searchParams.get("t") || "")}`;
  return page(`<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">One tap and you're on the list</h1>
  <p style="margin:0 0 20px;line-height:1.6;">New experiences and early-bird dates, straight to your inbox. You can leave again from the bottom of any email.</p>
  <form method="POST" action="${action}">
    <button type="submit" style="appearance:none;border:0;cursor:pointer;background:#00afdb;color:#fff;font-weight:700;font-size:15px;padding:14px 26px;border-radius:999px;">Yes, sign me up</button>
  </form>`);
}

export async function POST(req: NextRequest) {
  const c = valid(req);
  if (!c) return page(INVALID, 400);

  const db = createAdminClient() as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (t: string) => { update: (v: Record<string, unknown>) => any };
  };

  const { error } = await db
    .from("contacts")
    .update({
      marketing_opt_in: true,
      // The date that has to stand up if the consent is ever questioned.
      marketing_opt_in_at: new Date().toISOString(),
      accepts_marketing: true,
    })
    .eq("id", c);

  if (error) {
    return page(`<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">That didn't save</h1>
      <p style="margin:0;line-height:1.6;">Something went wrong at our end. Email experience@np-seven.com and we'll add you by hand.</p>`, 500);
  }

  return page(`<h1 style="margin:0 0 10px;font-size:22px;color:#00374a;">You're on the list 🤙</h1>
    <p style="margin:0;line-height:1.6;">We'll send new experiences and early-bird dates, and nothing else. Every email has a one-click way off at the bottom.</p>`);
}
