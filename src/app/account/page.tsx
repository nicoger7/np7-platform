import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMemberBookings, getMemberBannerImages, getMemberProfile, getMemberLevelDetail } from "@/lib/portal-data";
import { fmtDates, needsDownpayment } from "@/lib/portal-status";
import { displayLevel, levelProgress, nextTierFrom } from "@/lib/member-level";
import { firstNameInitial, initialsFrom } from "@/lib/member-profile";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { MemberHomeBanner } from "@/components/portal/member-home-banner";
import { LevelHomeCard } from "@/components/portal/level-home-card";
import { flags } from "@/lib/flags";

export const metadata: Metadata = { title: "My account — NP7" };
export const dynamic = "force-dynamic";

export default async function AccountHome() {
  const user = await getPortalUser();
  if (!user) {
    // Sign out so the middleware doesn't bounce us straight back here
    // (would loop if a Supabase session exists but no linked contact)
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
  const nextTrip = upcoming[0] ?? null;
  const unsecured = bookings.filter(needsDownpayment);

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

          {lvl && profile && (
            <div className="mt-5 max-w-[420px]">
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
            </div>
          )}

          {/* secure-your-spot — unsecured registrations */}
          {unsecured.length > 0 && (
            <div className="mb-7 rounded-2xl p-5 sm:p-6 text-white" style={{ background: "linear-gradient(135deg,#f47b20,#d8631a)" }}>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/80 mb-1.5">Action needed</p>
              <h2 className="text-xl font-black tracking-[-0.02em] mb-1">Secure your spot</h2>
              <p className="text-[14px] text-white/90 mb-4 max-w-[560px]">You&apos;re registered, but your place isn&apos;t held yet. Pay the refundable downpayment to lock it in — you&apos;ve got 14 days to change your mind, plenty of time to sort flights.</p>
              {unsecured.map((b) => (
                <Link key={b.id} href={`/account/bookings/${b.id}`} className="flex items-center justify-between gap-3 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-3 mb-2 last:mb-0 transition-colors">
                  <span className="font-bold text-[14px] truncate">{b.experience?.title ?? "Your trip"}<span className="font-normal text-white/80"> · {fmtDates(b.edition?.date_start, b.edition?.date_end)}</span></span>
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold">Secure now
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* dashboard stats */}
          <div className="flex flex-wrap gap-3 mb-7">
            <Stat label="Trips booked" value={String(bookings.length)} />
            {nextTrip && (
              <Stat
                label="Next trip"
                value={`${nextTrip.experience?.title ?? "Trip"} · ${fmtDates(nextTrip.edition?.date_start, nextTrip.edition?.date_end)}`}
              />
            )}
          </div>

          {/* next-up highlight */}
          {nextTrip && (
            <Link
              href={`/account/bookings/${nextTrip.id}`}
              className="group block bg-gradient-to-br from-[#00afdb] to-[#0782a0] rounded-2xl p-6 text-white mb-7 hover:-translate-y-0.5 transition-transform"
            >
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/75 mb-1.5">Next up</p>
              <h2 className="text-2xl font-black tracking-[-0.02em]">{nextTrip.experience?.title ?? "Your trip"}</h2>
              <p className="text-[14px] text-white/85 mt-1">{nextTrip.edition?.label ? `${nextTrip.edition.label} · ` : ""}{fmtDates(nextTrip.edition?.date_start, nextTrip.edition?.date_end)}</p>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold mt-4 group-hover:gap-2.5 transition-all">Manage trip
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          )}

          {/* section cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            <SectionCard
              href="/account/trips"
              accent="#00afdb"
              title="My Trips"
              desc={bookings.length ? `${bookings.length} trip${bookings.length === 1 ? "" : "s"} · payment, prep, photos & more` : "Book your first windsurf adventure"}
              icon={<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" />}
            />
            {flags.showGear && (
              <SectionCard
                href="/account/gear"
                accent="#7aa400"
                title="My Gear"
                desc="Track your board & fin orders from build to delivery"
                icon={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>}
              />
            )}
            <SectionCard
              href="/account/profile"
              accent="#c4621a"
              title="Profile"
              desc="Your details, sizes, diet & preferences"
              icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
            />
            {flags.showExperience && (
              <SectionCard
                href="/experience"
                accent="#00374a"
                title="Explore more"
                desc="Browse upcoming experiences & destinations"
                icon={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></>}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#f0e6d6] px-5 py-3.5">
      <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#00afdb]">{label}</p>
      <p className="text-[14px] font-bold text-[#00374a] mt-0.5">{value}</p>
    </div>
  );
}

function SectionCard({ href, title, desc, accent, icon }: { href: string; title: string; desc: string; accent: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group bg-white rounded-2xl border border-[#f0e6d6] p-6 flex items-start gap-4 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)] transition-all">
      <span className="shrink-0 w-11 h-11 rounded-xl grid place-items-center" style={{ backgroundColor: `${accent}1a`, color: accent }}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div className="min-w-0">
        <h3 className="text-[17px] font-extrabold tracking-[-0.01em] text-[#00374a] group-hover:text-[#00afdb] transition-colors">{title}</h3>
        <p className="text-[13.5px] text-[#6a7a80] leading-snug mt-1">{desc}</p>
      </div>
    </Link>
  );
}
