import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";
import { renderTemplate } from "@/lib/email/templates";
import { AUTOMATIONS, lifecycleLive, type TriggerSource } from "@/lib/email/automations";
import { EmailGroupTabs } from "@/components/admin/email-group-tabs";

/**
 * The three ways a mail gets sent, in the order that matters operationally:
 * the ones that run without you, then the ones that wait for you.
 */
const GROUPS: { source: TriggerSource; title: string; blurb: string; tab: string }[] = [
  { source: "guest", tab: "The guest triggers", title: "The guest sets these off",
    blurb: "Fires the moment they sign up, pay or invite a friend. Nobody at NP7 is involved — it goes out at 3am if that's when they book." },
  { source: "scheduled", tab: "The schedule triggers", title: "The schedule sets these off",
    blurb: "The nightly job works the date out from the trip and sends them. Nothing to press — which is why the content has to be in place before the date arrives." },
  { source: "staff", tab: "You trigger", title: "You set these off",
    blurb: "These only leave the building when someone here clicks send, confirm or settle in the admin. Nothing happens on its own." },
];

export const dynamic = "force-dynamic";
export const metadata = { title: "Emails — NP7 Admin" };

/** Realistic sample data filled into {{variables}} for the previews. */
const SAMPLE: Record<string, string> = {
  firstName: "Nico",
  experienceTitle: "NP7 Bonaire WindWeek",
  editionLabel: "Week 1",
  dates: "30 Nov – 6 Dec 2026",
  packageName: "Full Package",
  total: "€2,700",
  deposit: "300",
  balance: "€2,400",
  activationLink: "#",
  bookingLink: "#",
  whatsappLink: "#",
  reviewLink: "#",
  addonLabel: "Private coaching session",
  addonPrice: "€250",
  amount: "€2,445",
  reference: "NP7-A1B2C3",
  surveyTitle: "NP7 Experience Tenerife 2027",
  surveyIntro: "El Médano, one week in March — small crew, big wind.",
  surveyLink: "#",
};

export default async function EmailsHubPage() {
  const live = lifecycleLive();

  // Reflect any saved copy override (same logic sendEmail uses), so previews match reality.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: overrides } = await db.from("email_templates").select("*");
  type Ov = { template_key: string | null; subject_line?: string | null; body?: string | null; active?: boolean | null; header_image?: string | null };
  const overrideByKey = new Map<string, Ov>();
  for (const o of (overrides || []) as Ov[]) {
    if (o.template_key) overrideByKey.set(o.template_key, o);
  }

  const cards = AUTOMATIONS.map((a) => {
    const ov = overrideByKey.get(a.key);
    const useOv = ov && ov.active !== false ? ov : null;
    const built = renderTemplate(a.key, SAMPLE, useOv, a.division, useOv?.header_image || undefined);
    return { ...a, html: built.html, subject: built.subject, isLive: a.kind === "transactional" || live, hasOverride: !!ov?.body && ov?.active !== false };
  });

  const liveCount = cards.filter((c) => c.isLive).length;
  const pausedCount = cards.length - liveCount;

  return (
    <div>
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Emails</h1>
          <p className="text-sm admin-muted">Every email the system can send, what triggers it, and whether it&apos;s live right now.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />{liveCount} live</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-amber-300" />{pausedCount} paused</span>
        </div>
      </div>

      {/* Status banner */}
      <div className="rounded-xl p-4 mb-6 text-sm" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        {live ? (
          <p className="admin-muted"><strong className="admin-heading">Lifecycle pipeline is ON.</strong> All automations below send automatically at their trigger. The cutoff <code>EMAIL_PIPELINE_LIVE_FROM</code> still prevents emailing about trips before go-live.</p>
        ) : (
          <p className="admin-muted"><strong className="admin-heading">Soft launch — lifecycle paused.</strong> Only <strong>sign-up / login</strong> mail goes out. The other automations are <strong>held</strong> (nothing reaches customers) until you set <code>EMAIL_LIFECYCLE_LIVE=true</code> in Vercel. Nothing is lost — held emails fire correctly once you switch it on.</p>
        )}
      </div>

      {/* Lifecycle flow */}
      <div className="flex items-center gap-1.5 flex-wrap mb-6 text-[11px]">
        {["Account", "Reserve", "Deposit", "Balance", "Pre-trip", "Post-trip"].map((s, i, arr) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full bg-[var(--admin-accent)]/10 text-[#0aa3c7] font-bold">{s}</span>
            {i < arr.length - 1 && <span className="admin-faint">→</span>}
          </span>
        ))}
      </div>

      {/* Tabs, not one scroll: each card renders a live iframe preview, so all
          23 at once was a very long page. */}
      <EmailGroupTabs cards={cards} groups={GROUPS} />

      <p className="text-xs admin-faint mt-6">Click any email to edit its wording &amp; photo. Sent emails are logged in <Link href="/admin/email-log" className="text-[#0aa3c7] hover:underline">Email Log</Link>.</p>
    </div>
  );
}
