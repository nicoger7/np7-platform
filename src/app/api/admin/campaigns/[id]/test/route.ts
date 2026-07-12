import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { renderCampaignShell, personalize, type Campaign } from "@/lib/email/campaign";
import { SENDERS } from "@/lib/email/layout";

// POST /api/admin/campaigns/[id]/test { to } — send the rendered campaign to one
// address (subject prefixed [TEST]); marks test_sent_at so the composer can
// require a test before the real send.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const { to } = await request.json().catch(() => ({}));
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY isn't set." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data: c, error } = await client.from("email_campaigns").select("*").eq("id", id).single();
  if (error || !c) return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  const campaign = c as Campaign;
  if (!campaign.body || !campaign.subject) return NextResponse.json({ error: "Add a subject and a body first." }, { status: 400 });

  const shell = renderCampaignShell(campaign);
  // Test recipients get a sample personalization (their own address, "there").
  const p = personalize(shell.html, shell.subject, { id: "test", name: null });
  const { from, replyTo } = SENDERS[campaign.division] ?? SENDERS.experience;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, reply_to: replyTo, subject: `[TEST] ${p.subject}`, html: p.html }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: json?.message || `HTTP ${res.status}` }, { status: 400 });

  await client.from("email_campaigns").update({ test_sent_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, id: json?.id });
}
