import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect endpoint for the Cloudbeds integration (Sorobon).
 *
 * Cloudbeds' credential dialog requires a Redirect URI even for plain
 * API-key usage — this is that URI. Today it only acknowledges the
 * round-trip; when (if) we switch to the full OAuth flow, the code
 * exchange lands here. Deliberately: the `code` is NEVER logged or
 * echoed back into the page.
 */
export async function GET(req: NextRequest) {
  const hasCode = new URL(req.url).searchParams.has("code");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>NP7 × Cloudbeds</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;background:#f7fbfc;color:#00374a">
<div style="text-align:center">
<h1 style="font-size:20px">NP7 × Cloudbeds</h1>
<p>${hasCode ? "Authorization received — you can close this window. The NP7 team takes it from here." : "Connection endpoint is live. Nothing to do here."}</p>
</div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
