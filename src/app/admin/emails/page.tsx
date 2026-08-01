import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";
import { renderTemplate } from "@/lib/email/templates";
import { AUTOMATIONS, lifecycleLive, type TriggerSource } from "@/lib/email/automations";

/**
 * The three ways a mail gets sent, in the order that matters operationally:
 * the ones that run without you, then the ones that wait for you.
 */
const GROUPS: { source: TriggerSource; title: string; blurb: string }[] = [
  { source: "guest", title: "The guest sets these off",
    blurb: "Fires the moment they sign up, pay or invite a friend. Nobody at NP7 is involved — it goes out at 3am if that's when they book." },
  { source: "scheduled", title: "The schedule sets these off",
    blurb: "The nightly job works the date out from the trip and sends them. Nothing to press — which is why the content has to be in place before the date arrives." },
  { source: "staff", title: "You set these off",
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

      {/* Grouped by WHO sets the mail off. "Live vs paused" answers whether it
          can send; this answers whether anyone has to do anything for it to. */}
      {GROUPS.map((g) => {
        const inGroup = cards.filter((c) => c.source === g.source);
        if (!inGroup.length) return null;
        return (
          <div key={g.source} className="mb-8">
            <div className="flex items-baseline gap-2.5 mb-1 flex-wrap">
              <h2 className="text-[15px] font-bold admin-heading">{g.title}</h2>
              <span className="text-[11px] admin-faint font-semibold">{inGroup.length}</span>
            </div>
            <p className="text-[12px] admin-muted mb-3.5">{g.blurb}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {inGroup.map((c) => (
          <Link key={c.key} href={`/admin/email-templates?edit=${c.key}`} className="group rounded-xl overflow-hidden flex flex-col transition-all hover:-translate-y-0.5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="p-3.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--admin-accent)]/15 text-[#0aa3c7]">{c.stage}</span>
                  <h3 className="text-[13px] font-bold admin-heading truncate group-hover:text-[#0aa3c7] transition-colors">{c.name}</h3>
                </div>
                {c.isLive ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400"><span className="w-1 h-1 rounded-full bg-green-400" />LIVE</span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300"><span className="w-1 h-1 rounded-full bg-amber-300" />PAUSED</span>
                )}
              </div>
              <p className="text-[11px] admin-muted truncate">{c.trigger}{c.hasOverride && <span className="ml-1.5 text-[#0aa3c7]">· edited</span>}</p>
            </div>
            <div className="relative bg-white border-t" style={{ borderColor: "var(--admin-border)" }}>
              <iframe title={`${c.name} preview`} srcDoc={c.html} sandbox="" className="w-full h-[200px] pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-bold text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)] rounded-full px-2.5 py-1 shadow-lg">Click to edit →</span>
              </div>
            </div>
          </Link>
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-xs admin-faint mt-6">Click any email to edit its wording &amp; photo. Sent emails are logged in <Link href="/admin/email-log" className="text-[#0aa3c7] hover:underline">Email Log</Link>.</p>
    </div>
  );
}
