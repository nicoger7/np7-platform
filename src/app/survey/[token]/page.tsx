import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSurveyForToken, getSurvey, submitResponse } from "@/lib/surveys";
import { getPortalUser, getTeamMember } from "@/lib/auth";
import { SurveyForm } from "@/components/portal/survey-form";
import { SurveyQuick } from "@/components/portal/survey-quick";
import { satImage } from "@/lib/satellite";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ pick?: string; saved?: string }> };

// Hidden, invite-only — never indexed, never linked publicly.
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "NP7 — a private invitation" };
export const dynamic = "force-dynamic";

const PREVIEW_PREFIX = "preview-";

export default async function SurveyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { pick, saved } = await searchParams;
  const isPreview = token.startsWith(PREVIEW_PREFIX);

  let survey, contactName: string | null = null, response = null;
  if (isPreview) {
    // Admin/team preview: render the final survey from its id, no invite needed.
    const team = await getTeamMember().catch(() => null);
    if (!team) notFound();
    survey = await getSurvey(token.slice(PREVIEW_PREFIX.length));
    if (!survey) notFound();
  } else {
    const data = await getSurveyForToken(token);
    if (!data) notFound();
    ({ survey, contactName, response } = data);
  }

  // One-click registration (quick surveys): the email button's link carries the
  // answer — save it BEFORE first paint, then bounce to a clean URL so a refresh
  // can't re-save and the page opens already in the "you're in" state.
  if (!isPreview && pick && survey.quick && survey.status === "open" && response !== undefined) {
    const valid = new Set(survey.destinations.map((d) => d.key));
    const existingPicks = response?.other_destinations ?? [];
    if (pick === "none") {
      const note = "Can't make it this time";
      await submitResponse(token, { top_destination: null, other_destinations: [], weeks: [], budget_ok: response?.budget_ok ?? null, looking_for: note });
      redirect(`/survey/${token}?saved=1`);
    } else if (valid.has(pick)) {
      const merged = existingPicks.includes(pick) ? existingPicks : [...existingPicks, pick];
      await submitResponse(token, { top_destination: null, other_destinations: merged, weeks: [], budget_ok: response?.budget_ok ?? null, looking_for: response?.looking_for?.startsWith("Can't make it") ? null : response?.looking_for ?? null });
      redirect(`/survey/${token}?saved=1`);
    }
  }

  const user = await getPortalUser().catch(() => null);
  const firstName = contactName?.split(/\s+/)[0] || null;

  // Hero photo = the first trip's image (or a satellite view of its pin), else a
  // premium default — never the low-res poster.
  const heroTrip = survey.destinations.find((d) => d.image) ?? survey.destinations.find((d) => d.lat != null && d.lng != null);
  const heroImg =
    heroTrip?.image ||
    (heroTrip?.lat != null && heroTrip?.lng != null ? satImage(heroTrip.lat, heroTrip.lng) : null) ||
    "https://media.np-seven.com/experiences/np7-bonaire/place/bonaire-spot-overview-drone-shot.jpg";

  return (
    <main className="min-h-[100svh] bg-[#fdf6ea]">
      {isPreview && (
        <div className="sticky top-0 z-30 bg-[#0a2a33] text-white text-[12.5px] font-bold text-center py-2 px-4">
          👁 Preview — exactly what an invited member sees. Try it end-to-end; nothing you submit here is saved.
        </div>
      )}
      {/* Immersive, aspirational hero — a real windsurf backdrop under a deep
          ocean gradient, with a gold "by invitation" treatment so it reads
          premium the moment it opens (this is a dream-trip invite, not a form). */}
      <header className="relative overflow-hidden flex flex-col min-h-[430px] sm:min-h-[540px] text-white">
        <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${heroImg}')` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(1,32,42,0.50) 0%, rgba(1,28,38,0.28) 38%, rgba(1,22,30,0.90) 100%)" }} />
        {heroImg.includes("/api/sat") && <span className="absolute bottom-1 right-2 z-20 text-[9px] font-medium text-white/50">Imagery © Esri</span>}
        <div className="absolute top-0 inset-x-0 h-[3px] z-10" style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 45%,#f47b20)" }} />
        <div className="relative z-10 mt-auto w-full max-w-[720px] mx-auto px-5 sm:px-8 pb-12 pt-16">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: "#ffd97a" }}>
            <span aria-hidden>✦</span> By private invitation
          </span>
          <h1 className="text-4xl sm:text-[62px] font-black tracking-[-0.03em] mt-4 leading-[1.02]">{survey.title}</h1>
          {survey.intro && <p className="text-white/85 text-[16px] sm:text-[17.5px] leading-relaxed mt-5 max-w-[580px] whitespace-pre-line">{survey.intro}</p>}
          {firstName && <p className="text-[14px] mt-6 font-semibold" style={{ color: "#ffe0a0" }}>Hey {firstName} — you&apos;re one of just a handful of riders I&apos;m asking. 🤙</p>}
        </div>
      </header>

      <div className="max-w-[720px] mx-auto px-5 sm:px-8 py-9 sm:py-12">
        {survey.status === "closed" && !isPreview ? (
          <div className="rounded-2xl border border-[#ecdcbb] bg-white p-8 text-center shadow-[0_10px_30px_rgba(120,90,20,0.06)]">
            <h2 className="text-[19px] font-black text-[#00374a]">This invitation has closed</h2>
            <p className="text-[14px] text-[#6a7a80] mt-2">Thanks for your interest — keep an eye on your inbox for what&apos;s next. 🌊</p>
          </div>
        ) : (
          <>
            {survey.quick
              ? <SurveyQuick survey={survey} token={token} existing={response} preview={isPreview} justSaved={saved === "1"} />
              : <SurveyForm survey={survey} token={token} contactName={contactName} existing={response} preview={isPreview} />}
            {!user && !isPreview && (
              <p className="text-[12.5px] text-[#9a8a6a] text-center mt-6">
                Have an NP7 account? <Link href="/account" className="font-semibold text-[#b0791e] hover:underline">Log in</Link> — not required, this invitation is already personal to you.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
