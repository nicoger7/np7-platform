import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser, getTeamMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMemberBookings, getMemberBannerImages, getMemberProfile, getMemberProgression, getProfilePhotoChoices, getMemberGuides } from "@/lib/portal-data";
import { getExperienceCards } from "@/lib/experience-cards";
import { getMemberTier } from "@/lib/member-tier";
import { ExpTileCardCompact } from "@/components/experience/upcoming-experiences";
import { fmtDates, needsDownpayment, paymentStageLabel } from "@/lib/portal-status";
import { hasFlightDetails, type FlightInfo } from "@/lib/flights";
import { firstNameInitial, initialsFrom } from "@/lib/member-profile";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { MemberHomeBanner } from "@/components/portal/member-home-banner";
import { LevelHomeCard } from "@/components/portal/level-home-card";
import { HomeProgress } from "@/components/portal/home-progress";
import { GuideCard } from "@/components/portal/guide-card";
import { SetupProgress, type SetupStep } from "@/components/portal/setup-progress";
import { SetPasswordPrompt } from "@/components/portal/set-password-prompt";
import { getMemberApplication } from "@/lib/signature";
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
    try { await fetch("/api/portal/end-preview", { method: "POST" }); } catch { /* best effort */ }
    await supabase.auth.signOut();
    redirect("/account/login");
  }
  const tier = await getMemberTier(user.contactId).catch(() => null);
  const [bookings, bannerImages, profile, progression, signatureApp, nextTrips, guides] = await Promise.all([
    getMemberBookings(user.contactId),
    getMemberBannerImages(user.contactId).catch(() => []),
    getMemberProfile(user.contactId).catch(() => null),
    getMemberProgression(user.contactId).catch(() => null),
    getMemberApplication(user.contactId).catch(() => null),
    getExperienceCards(tier ? { tierKey: tier.key, tierLabel: tier.label } : null).then((r) => r.cards).catch(() => []),
    getMemberGuides(user.contactId).catch(() => []),
  ]);
  // The guide is the most personal thing NP7 makes and it used to live at the
  // bottom of one booking's Trip tab, where nobody found it. Unread, it leads
  // the home. Read, it becomes a tile like the rest.
  const unreadGuides = guides.filter((g) => !g.openedAt);
  const ownPhotoCount = await getProfilePhotoChoices(user.contactId).then((p) => p.length).catch(() => 0);
  // An experience the member already has an UPCOMING booking in doesn't need
  // selling — "book your next trip" means the next one, not the one they're
  // packing for. A PAST trip hides nothing: rebooking Bonaire next season is
  // exactly what this row is for. (`bookings` is already cancelled/lost-free.)
  const today = new Date().toISOString().slice(0, 10);

  /* Somebody who has travelled comes back for what the trip left them: the
     photos, the guide, the trip itself. For them those three belong near the
     top, not under the sales row and the ladder. Somebody who has not travelled
     has empty versions of two of them, so for them the row stays where it was
     and the page keeps selling. */
  const hasTravelled = bookings.some((b) => (b.edition?.date_end ?? b.edition?.date_start ?? "") < today);
  const upcomingBookedSlugs = new Set(
    bookings
      .filter((b) => (b.edition?.date_end ?? b.edition?.date_start ?? "") >= today)
      .map((b) => b.experience?.slug)
      .filter(Boolean)
  );
  // Only weeks you can actually book — a "dates coming soon" tile sells nothing here.
  const bookableTrips = nextTrips
    .filter((c) => c.dateLabel !== "Dates coming soon" && !upcomingBookedSlugs.has(c.slug))
    .slice(0, 3);
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

  // Home card reads the SAME 6-rank ladder as the Progress page — one source of
  // truth (rank + "N skills to <next>" + band progress). Verified ✓ = at least
  // one coach-verified skill.
  const lvl = progression
    ? {
        level: progression.level,
        verified: progression.coachCount > 0,
        nextTier: progression.nextLevel,
        toNext: progression.toNext,
        pct: progression.pct,
      }
    : null;

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
  // An edition is either a travelled week or a 1–2 day clinic (migration 157).
  const events = tripCards.filter(({ b }) => b.edition?.kind === "event").length;
  const cardsHeading = events === tripCards.length && events > 0
    ? (tripCards.length > 1 ? "events" : "next event")
    : events > 0
      ? "trips & events"
      : (tripCards.length > 1 ? "trips" : "next trip");

  // A photo avatar is EARNED on a trip — trip photos are the only source (see
  // community-profile.tsx: "ride with your initials until your first trip"). So
  // only offer "Add a profile photo" once the rider has actually attended; nagging
  // a fresh signup to add a photo they can't add yet is a dead end. It surfaces on
  // its own after their first trip.
  const hasAttended = bookings.some((b) => {
    const st = String(b.status ?? "").toLowerCase();
    if (st.includes("attend")) return true;
    const end = b.edition?.date_end;
    return !!end && end < today && !/lost|cancel|lead/.test(st);
  });

  // "Get set up" onboarding strip — endowed progress: account is always the
  // first (done) step so the bar never starts at 0%. This is ONE-TIME PROFILE
  // setup only — the per-trip "secure your spot" action lives on the trip cards
  // below (which handle multiple trips), so nothing is duplicated. The strip
  // hides once the profile is complete.
  const setupSteps: SetupStep[] = profile
    ? [
        { key: "account", label: "Account created", done: true, href: "/account" },
        // Done if they've declared a level OR already have a real one — a coach-
        // verified rank (lvl.verified / level_status) counts; don't nag someone
        // whose level card already shows a verified rank to "set" it.
        { key: "level", label: "Set your riding level", hint: "So coaches meet you where you are", done: !!profile.self_level || !!lvl?.verified || profile.level_status === "verified", href: "/account/level" },
        // Only once photos of THEM exist to pick from (or one is already set).
        ...(ownPhotoCount > 0 || profile.avatar_url
          ? [{ key: "photo", label: "Add a profile photo", hint: `Pick one of your ${ownPhotoCount || ""} trip photos`.replace("  ", " "), done: !!profile.avatar_url, href: "/account/profile" } as SetupStep]
          : []),
        // The crew shirt needs a size — the step nags until it's filled in.
        { key: "tshirt", label: "Your T-shirt size", hint: "For the crew shirt waiting on your next trip", done: !!profile.tshirt_size, href: "/account/settings" },
        { key: "handle", label: "Pick your @handle", hint: "Your name on the crew & spotguide", done: !!profile.username, href: "/account/profile", inline: "handle" },
      ]
    : [];

  /* Only the tiles that lead somewhere.
     A member with nothing booked had three cards pointing at three empty pages,
     which is a worse first impression than no row at all. So each one appears
     only once it has something behind it, and with none of them the row does
     not render. Memories keys off a FINISHED trip rather than a photo count:
     the count is another query on every home load, and a week that has happened
     is the thing that produces photos. */
  const shelfTiles = [
    bookings.length > 0 && (
      <SectionCard
        key="trips"
        href="/account/trips" title="My trips" tone="ocean"
        desc={`${bookings.length} trip${bookings.length === 1 ? "" : "s"} · prep, photos`}
        icon={<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" />}
      />
    ),
    hasTravelled && (
      <SectionCard
        key="memories"
        href="/account/memories" title="My memories" tone="ocean"
        desc="Photos and video from your weeks"
        icon={<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>}
      />
    ),
    guides.length > 0 && (
      <SectionCard
        key="guides"
        href="/account/guides" title="My focus points" tone="ocean"
        badge={unreadGuides.length > 0 ? `${unreadGuides.length} new` : undefined}
        desc={`${guides.length} guide${guides.length === 1 ? "" : "s"} from your coaches`}
        icon={<><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="4" /></>}
      />
    ),
  ].filter(Boolean);

  /* Rendered in one of two places depending on hasTravelled, so the markup
     lives once. Columns follow the count, or two tiles would sit in a
     three-column grid next to a tile-shaped hole. */
  const shelf = shelfTiles.length > 0 ? (
    <div className={`grid grid-cols-1 gap-3 mt-6 ${shelfTiles.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : shelfTiles.length === 2 ? "sm:grid-cols-2" : ""}`}>
      {shelfTiles}
    </div>
  ) : null;

  return (
    <>
      <PortalChrome />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-7 sm:py-9">
          <MemberHomeBanner
            images={bannerImages}
            name={first}
            tier={tier}
            level={progression?.level ? { label: progression.level, pct: progression.pct ?? 0 } : null}
            subtitle="Welcome to your NP7 home — your trips, your gear and everything in between."
          />

          <div className="mt-6">
            <SetPasswordPrompt show={showPwPrompt} />
          </div>

          {setupSteps.length > 0 && (
            <div className="mt-6">
              <SetupProgress steps={setupSteps} />
            </div>
          )}

          {/* A guide nobody has read yet. High on the page on purpose: it lands
              days after a trip with no announcement, and until now the only way
              to find it was to open the right booking and scroll. It drops back
              to a tile the moment it is opened. */}
          {unreadGuides.length > 0 && (
            <div className="mt-6 space-y-3">
              {unreadGuides.slice(0, 2).map((g) => <GuideCard key={g.id} guide={g} unread />)}
              {unreadGuides.length > 2 && (
                <Link href="/account/guides" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb] hover:gap-2.5 transition-all">
                  {unreadGuides.length - 2} more waiting
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </Link>
              )}
            </div>
          )}

          {/* Signature Trip application status — the "kept a bit open" loop */}
          {signatureApp && signatureApp.status !== "declined" && (
            <div className="mt-6">
              <Link href="/signature" className="group flex items-center gap-4 rounded-2xl p-5 text-white hover:-translate-y-0.5 transition-transform" style={{ background: "linear-gradient(135deg,#013443,#01222d)", border: "1px solid rgba(255,217,122,0.25)" }}>
                <span className="shrink-0 w-11 h-11 rounded-full grid place-items-center text-[18px] font-black" style={{ background: "linear-gradient(145deg,#ffe08a,#f0a500)", color: "#3a2a05" }}>✦</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ffd97a]">Signature Trips</p>
                  <p className="text-[14.5px] font-bold mt-0.5">
                    {signatureApp.status === "accepted" ? "You're accepted 🎉 — we'll reach out with the details."
                      : signatureApp.status === "shortlisted" ? "You've been shortlisted 🎉 — we'll be in touch."
                      : "Your application is in — under review."}
                  </p>
                </div>
                <span className="shrink-0 text-[12.5px] font-bold text-white/60 group-hover:text-white transition-colors">View →</span>
              </Link>
            </div>
          )}

          {/*
           * Main + level sidebar — one column on mobile, two on desktop.
           *
           * The second column only exists when there is something to put in it.
           * With no upcoming trip the left cell rendered nothing while the grid
           * still reserved 1.6fr for it, so the profile card sat alone against a
           * card-shaped hole — the page looked broken rather than empty. A
           * member with nothing booked is the one most likely to be new, and a
           * hole is a poor first impression. Now the row collapses and the
           * profile card spans it, with "Book your next trip" below carrying the
           * action, which is the right thing for that member anyway.
           */}
          <div className={`mt-6 grid gap-5 items-start ${tripCards.length > 0 ? "lg:grid-cols-[1.6fr_1fr]" : "grid-cols-1"}`}>
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

            {/* your trips — one card each, carrying its own action. Omitted
                entirely when empty: an empty cell still costs a grid gap. */}
            {tripCards.length > 0 && (
            <div className="lg:order-1">
              {/* A clinic is not a trip, and calling it one on the member's own
                  home page is the first thing they read. Say what they actually
                  booked — and when they've booked both, say both. */}
              {tripCards.length > 0 && <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac] mb-3">Your {cardsHeading}</p>}
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
                      {/* "Your trip so far" — compact endowment recap of what's already set up */}
                      {!secure && (() => {
                        const done = [
                          paymentStageLabel(b),
                          hasFlightDetails(b.flight_info as FlightInfo | null) ? "Flights added" : null,
                          b.wa_group ? "In the crew chat" : null,
                        ].filter(Boolean) as string[];
                        return (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {done.map((d) => (
                              <span key={d} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0f6e56] bg-[#e6f5ee] rounded-full px-2 py-0.5">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{d}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </Link>
                  ))}
                </div>
              ) : null}


            </div>
            )}
          </div>

          {/* High, but never above the money. Anything needing action sits in
              the grid above this; with nothing upcoming that grid collapses and
              these land directly under the greeting, which is the point. */}
          {hasTravelled && shelf}

          {/* Book your next trip — full width, OUTSIDE the two-column grid.
              It used to sit in the left column beside the sticky profile card,
              which capped it at ~62% of the page: two tiles and a card-sized
              hole to their right on every wide screen, with the space under the
              profile card going unused. Out here it gets the whole row.

              auto-fit rather than a fixed column count, so the tiles always
              fill the row whatever the number: empty tracks collapse, so two
              trips stretch across the width instead of leaving a gap, and the
              earlier even-count rule is no longer needed to avoid an orphan.
              Still capped at four — "All trips" carries the rest. */}
          {bookableTrips.length > 0 && (
            <div className="mt-6">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac]">Book your next trip</p>
                <Link href="/experience" className="text-[12.5px] font-bold text-[#00afdb] hover:underline">All trips →</Link>
              </div>
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
                {bookableTrips.slice(0, 4).map((c) => <ExpTileCardCompact key={c.id} exp={c} />)}
              </div>
            </div>
          )}

          {/* Your progression — the ladder gets real estate on the home, not just a
              chip: rank + 6-rung ladder + per-discipline breakdown, linking to the
              full Progress page. */}
          {progression && (
            <div className="mt-6">
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac] mb-3">Your progression</p>
              <HomeProgress progression={progression} selfLevel={profile?.self_level ?? null} avatarUrl={profile?.avatar_url ?? null} initials={initialsFrom(profile?.name)} />
            </div>
          )}

          {!hasTravelled && shelf}
          {(flags.showGear || flags.showExperience) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {flags.showGear && <SectionCard href="/account/gear" title="My gear" desc="Board & fin orders" icon={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>} />}
              {flags.showExperience && <SectionCard href="/experience" title="Explore" desc="Trips & destinations" icon={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></>} />}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * `tone: "ocean"` is for the three cards a member actually comes back for. They
 * were the same flat white box as the shop link, which made the row read as
 * five equal errands. The icon now sits on the brand gradient and the card
 * lifts a little further, so the row has a subject.
 */
function SectionCard({ href, title, desc, icon, tone, badge }: { href: string; title: string; desc: string; icon: React.ReactNode; tone?: "ocean"; badge?: string }) {
  const ocean = tone === "ocean";
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden bg-white rounded-2xl border flex items-start gap-3.5 transition-all ${ocean
        ? "border-[#e6dcc9] p-5 pt-[22px] hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(0,55,74,0.12)] hover:border-[#cfe7ef]"
        : "border-[#f0e6d6] p-5 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.08)]"}`}
    >
      {/* Sun to sea. The one device that says NP7 without a logo, and the same
          bar that runs across the top of a trip hero and a guide card. */}
      {ocean && (
        <span className="absolute top-0 inset-x-0 h-[3px]" style={{ background: "linear-gradient(90deg,#ffc42e,#f0774a 55%,#00afdb)" }} />
      )}
      <span
        className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center transition-transform group-hover:scale-105 ${ocean ? "text-white" : "bg-[#00afdb]/10 text-[#00afdb]"}`}
        style={ocean ? { background: "linear-gradient(150deg,#00232f,#00374a 45%,#0782a0)", boxShadow: "0 6px 16px -6px rgba(0,55,74,.55)" } : undefined}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className={`text-[16px] text-[#00374a] group-hover:text-[#00afdb] transition-colors truncate ${ocean ? "font-black tracking-[-0.02em]" : "font-extrabold tracking-[-0.01em]"}`}>{title}</h3>
          {badge && (
            <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full text-[#3a2a05]" style={{ background: "linear-gradient(135deg,#ffe08a,#f0a500)" }}>{badge}</span>
          )}
        </div>
        <p className="text-[13px] text-[#6a7a80] leading-snug mt-0.5">{desc}</p>
      </div>
      {ocean && (
        <svg className="shrink-0 self-center w-4 h-4 text-[#c3d2d8] group-hover:text-[#00afdb] group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      )}
    </Link>
  );
}
