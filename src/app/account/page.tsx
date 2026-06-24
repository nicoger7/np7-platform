import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser, getTeamMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMemberBookings, getMemberBannerImages, getMemberProfile, getMemberLevelDetail } from "@/lib/portal-data";
import { fmtDates, needsDownpayment } from "@/lib/portal-status";
import { displayLevel, levelProgress, nextTierFrom } from "@/lib/member-level";
import { firstNameInitial, initialsFrom } from "@/lib/member-profile";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { MemberHomeBanner } from "@/components/portal/member-home-banner";
import { LevelHomeCard } from "@/components/portal/level-home-card";
import { SetPasswordPrompt } from "@/components/portal/set-password-prompt";
import { flags } from "@/lib/flags";

export const metadata: Metadata = { title: "My account — NP7" };
export const dynamic = "force-dynamic";

export default async function AccountHome() {
  const user = await getPortalUser();
  if (!user) {
    // Authenticated, but no linked member contact. If this is a team member
    // (admin) peeking at the member area, DON'T sign them out — that would kill
    // the shared session and log them out of admin too. Send them to admin
    // instead. Only a true orphan session (neither member nor team) is signed
    // out, to avoid a redirect loop with the login page.
    if (await getTeamMember()) redirect("/admin");
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/account/login");
  }
  const [bookings, bannerImages, profile, levelDetail] = await Promise.all([
    getMemberBookings(user.contactId),
    getMemberBannerImages(user.contactId).catch(() => []),
    getMemberProfile(user.contactId).catch(() => null),
    getMemberLevelDetail(user.contactId).catch(() => null),
  ]);
  const first = user.name?.split(" ")[0] ?? "there";

  // Suggest setting a password if the member has only ever used magic links — but
  // not if they have one already, and not if they dismissed the nudge within the
  // last 30 days (the dismissal lives in account metadata, so it's cross-device;
  // after the cooldown we surface it once more).
  const PW_PROMPT_COOLDOWN_DAYS = 30;
  const showPwPrompt = await (async () => {
    try {
      const { data: { user: authUser } } = await (await createClient()).auth.getUser();
      const meta = (authUser?.user_metadata ?? {}) as { has_password?: boolean; pw_prompt_dismissed_at?: string };
      if (meta.has_password) return false;
      const dismissedAt = typeof meta.pw_prompt_dismissed_at === "string" ? new Date(meta.pw_prompt_dismissed_at).getTime() : 0;
      const cooledDown = !dismissedAt || Date.now() - dismissedAt >= PW_PROMPT_COOLDOWN_DAYS * 86400000;
      return cooledDown;
    } catch { return false; } // on any hiccup, don't nag
  })();

  // level progress for the home dashboard card
  const lvl = levelDetail
    ? (() => {
        const shown = displayLevel({ self_level: levelDetail.self_level, level: levelDetail.coach_level, level_status: levelDetail.level_status });
        const prog = levelProgress(levelDetail.milestones);
        const nx = nextTierFrom(shown.level, prog.tiers);
        return { level: shown.level, verified: shown.verified, nextTier: nx.nextTier, toNext: nx.toNext, pct: nx.pct };
      })()
    : null;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings
    .filter((b) => b.edition?.date_start && b.edition.date_start >= today)
    .sort((a, b) => ((a.edition?.date_start ?? "") < (b.edition?.date_start ?? "") ? -1 : 1));
  const unsecured = bookings.filter(needsDownpayment);
  // one card per trip that needs attention: unsecured first (secure CTA), then
  // upcoming secured trips (manage CTA)
  const tripCards = [
    ...unsecured.map((b) => ({ b, secure: true })),
    ...upcoming.filter((b) => !needsDownpayment(b)).map((b) => ({ b, secure: false })),
  ];

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <MemberHomeBanner
            images={bannerImages}
            name={first}
            subtitle="Welcome to your NP7 home — your trips, your gear and everything in between."
          />

          <div className="mt-6">
            <SetPasswordPrompt show={showPwPrompt} />
          </div>

          {/* main + level sidebar — one column on mobile, two on desktop */}
          <div className="mt-6 grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
            {/* level card: first on mobile, right sidebar on desktop */}
            {lvl && profile && (
              <aside className="lg:order-2 lg:sticky lg:top-32">
                <LevelHomeCard
                  avatarUrl={profile.avatar_url}
                  initials={initialsFrom(profile.name)}
                  displayName={firstNameInitial(profile.name)}
                  username={profile.username}
                  level={lvl.level}
                  verified={lvl.verified}
                  nextTier={lvl.nextTier}
                  toNext={lvl.toNext}
                  pct={lvl.pct}
                />
              </aside>
            )}

            {/* your trips — one card each, carrying its own action */}
            <div className="lg:order-1">
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac] mb-3">Your {tripCards.length > 1 ? "trips" : "next trip"}</p>
              {tripCards.length > 0 ? (
                <div className="space-y-3">
                  {tripCards.map(({ b, secure }) => (
                    <Link key={b.id} href={`/account/bookings/${b.id}`}
                      className={`group block rounded-2xl p-5 transition-all hover:-translate-y-0.5 ${secure ? "text-white" : "bg-white border border-[#f0e6d6] hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)]"}`}
                      style={secure ? { background: "linear-gradient(135deg,#f47b20,#d8631a)" } : undefined}>
                      {secure && <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/80 mb-1.5">Action needed · secure your spot</p>}
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className={`text-xl font-black tracking-[-0.02em] truncate ${secure ? "text-white" : "text-[#00374a]"}`}>{b.experience?.title ?? "Your trip"}</h2>
                          <p className={`text-[13.5px] mt-0.5 ${secure ? "text-white/85" : "text-[#6a7a80]"}`}>{b.edition?.label ? `${b.edition.label} · ` : ""}{fmtDates(b.edition?.date_start, b.edition?.date_end)}</p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold group-hover:gap-2.5 transition-all ${secure ? "text-white" : "text-[#00afdb]"}`}>
                          {secure ? "Secure now" : "Manage"}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Link href="/experience" className="group block bg-white rounded-2xl border border-[#f0e6d6] p-6 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)] transition-all">
                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#00374a]">No trips booked yet</h2>
                  <p className="text-[13.5px] text-[#6a7a80] mt-0.5">Your next windsurf adventure is waiting.</p>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb] mt-3 group-hover:gap-2.5 transition-all">Explore experiences
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* Quick links — uniform, single accent; a row across the bottom on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <SectionCard href="/account/trips" title="My trips" desc={bookings.length ? `${bookings.length} trip${bookings.length === 1 ? "" : "s"} · prep, photos` : "Book your first adventure"} icon={<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" />} />
            {bookings.length > 0 && <SectionCard href="/account/memories" title="My memories" desc="Photos from all your trips" icon={<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>} />}
            {flags.showGear && <SectionCard href="/account/gear" title="My gear" desc="Board & fin orders" icon={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>} />}
            <SectionCard href="/account/level" title="Progress" desc="Your level & skills" icon={<path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7" />} />
            {flags.showExperience && <SectionCard href="/experience" title="Explore" desc="Trips & destinations" icon={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></>} />}
          </div>
        </div>
      </main>
    </>
  );
}

function SectionCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group bg-white rounded-2xl border border-[#f0e6d6] p-5 flex items-start gap-3.5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)] transition-all">
      <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center bg-[#00afdb]/10 text-[#00afdb]">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div className="min-w-0">
        <h3 className="text-[16px] font-extrabold tracking-[-0.01em] text-[#00374a] group-hover:text-[#00afdb] transition-colors">{title}</h3>
        <p className="text-[13px] text-[#6a7a80] leading-snug mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
