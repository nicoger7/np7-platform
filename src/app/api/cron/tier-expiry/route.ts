import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getMemberTier } from "@/lib/member-tier";
import { sendEmail } from "@/lib/email/send";
import { TIER_KEEP } from "@/lib/tier-config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly: warn members whose loyalty tier lapses within the next 60 days.
 *
 * One mail per contact per expiry date (the dedupe key carries validUntil), so
 * a member who extends their status never hears from this again — and one who
 * doesn't hears exactly once. Deliberately NOT on the soft-launch allowlist:
 * it goes live with the e-mail lifecycle switch.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Only contacts who have ever finished a trip can hold a lapsing tier.
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await db
    .from("exp_bookings")
    .select("contact_id, status, exp_editions!inner(date_end)")
    .in("status", ["attended", "confirmed", "paid"])
    .lt("exp_editions.date_end", today);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactIds = [...new Set(((rows ?? []) as any[]).map((r) => r.contact_id).filter(Boolean))] as string[];

  const horizon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  let sent = 0, checked = 0;
  for (const cid of contactIds) {
    checked++;
    const tier = await getMemberTier(cid).catch(() => null);
    if (!tier || tier.key === "rider" || !tier.validUntil) continue;
    if (tier.validUntil < today || tier.validUntil > horizon) continue;
    const { data: c } = await db.from("contacts").select("name,email").eq("id", cid).maybeSingle();
    if (!c?.email) continue;
    const keepRule = tier.key === "legend"
      ? `Legend lives on a pace of 2 trips within 12 months (a clinic counts 0.25).`
      : `Crew stays with ${TIER_KEEP.crew} trip a year (a clinic counts 0.25).`;
    const until = new Date(tier.validUntil + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const res = await sendEmail({
      to: c.email,
      templateKey: "tier_expiry_reminder",
      vars: {
        firstName: String(c.name ?? "").split(" ")[0] || undefined,
        tierLabel: tier.label,
        validUntilLabel: until,
        keepRule,
        tripsLink: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com"}/experience`,
      },
      contactId: cid,
      dedupeKey: `tier_expiry:${cid}:${tier.validUntil}`,
    }).catch(() => null);
    if (res) sent++;
  }
  return NextResponse.json({ ok: true, checked, sent });
}
