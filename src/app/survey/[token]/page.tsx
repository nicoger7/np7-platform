import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSurveyForToken, getSurvey, getSurveyByOpenToken, joinSurveyAsMember, submitResponse } from "@/lib/surveys";
import { getPortalUser, getTeamMember } from "@/lib/auth";
import { SurveyForm } from "@/components/portal/survey-form";
import { resolveSurveyInfo, type SurveyInfo } from "@/lib/surveys";
import { SurveyQuick } from "@/components/portal/survey-quick";
import { SurveyJoin } from "@/components/portal/survey-join";
import { satImage } from "@/lib/satellite";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ pick?: string; saved?: string }> };

/**
 * Hidden, invite-only — never indexed, never linked publicly.
 *
 * The browser-tab title follows the survey's own gold line, which already
 * defaults to "By private invitation" and is editable in the admin. It used to
 * be hard-coded, so an open-link survey anyone could share still announced
 * itself as a private invitation. Discretion stays the default; if a survey
 * says something else on the page, the tab says it too.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const base: Metadata = { robots: { index: false, follow: false } };
  try {
    const { token } = await params;
    const survey = token.startsWith(PREVIEW_PREFIX)
      ? await getSurvey(token.slice(PREVIEW_PREFIX.length))
      : (await getSurveyForToken(token))?.survey ?? (await getSurveyByOpenToken(token));
    const label = (survey?.eyebrow ?? "").trim();
    return { ...base, title: `NP7 — ${label || "a private invitation"}` };
  } catch {
    return { ...base, title: "NP7 — a private invitation" };
  }
}
export const dynamic = "force-dynamic";

const PREVIEW_PREFIX = "preview-";

export default async function SurveyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { pick, saved } = await searchParams;
  const isPreview = token.startsWith(PREVIEW_PREFIX);

  let survey, contactName: string | null = null, response = null;
  // The shareable OPEN link: same page, but the visitor introduces themselves
  // first (name + email → their own personal invite link).
  let isOpenLink = false;
  if (isPreview) {
    // Admin/team preview: render the final survey from its id, no invite needed.
    const team = await getTeamMember().catch(() => null);
    if (!team) notFound();
    survey = await getSurvey(token.slice(PREVIEW_PREFIX.length));
    if (!survey) notFound();
  } else {
    const data = await getSurveyForToken(token);
    if (data) {
      ({ survey, contactName, response } = data);
    } else {
      survey = await getSurveyByOpenToken(token);
      if (!survey) notFound();
      isOpenLink = true;
      // Already logged in? Skip the name+email card — join with their account
      // contact and bounce straight to their personal survey link.
      const member = await getPortalUser().catch(() => null);
      if (member?.contactId) {
        const res = await joinSurveyAsMember(token, member.contactId);
        if ("token" in res) redirect(`/survey/${res.token}`);
      }
    }
  }

  // One-click registration (quick surveys): the email button's link carries the
  // answer — save it BEFORE first paint, then bounce to a clean URL so a refresh
  // can't re-save and the page opens already in the "you're in" state.
  // (any survey with dated trips can carry one-tap email buttons — not just quick)
  if (!isPreview && !isOpenLink && pick && survey.status === "open" && response !== undefined) {
    const valid = new Set(survey.destinations.map((d) => d.key));
    const existingPicks = response?.other_destinations ?? [];
    if (pick === "none") {
      const note = "Can't make it this time";
      await submitResponse(token, { top_destination: null, other_destinations: [], weeks: [], budget_ok: response?.budget_ok ?? null, looking_for: note });
      redirect(`/survey/${token}?saved=1`);
    } else if (valid.has(pick)) {
      const merged = existingPicks.includes(pick) ? existingPicks : [...existingPicks, pick];
      // keep an existing star; a lone pick is implicitly the favourite
      const top = response?.top_destination && merged.includes(response.top_destination)
        ? response.top_destination
        : merged.length === 1 ? merged[0] : null;
      await submitResponse(token, { top_destination: top, other_destinations: merged, weeks: [], budget_ok: response?.budget_ok ?? null, looking_for: response?.looking_for?.startsWith("Can't make it") ? null : response?.looking_for ?? null });
      redirect(`/survey/${token}?saved=1`);
    }
  }

  const user = await getPortalUser().catch(() => null);
  const firstName = contactName?.split(/\s+/)[0] || null;

  // Info buttons: resolve every place's ticked IDs into content, keyed by the
  // place's own key so the form can hang the buttons on the right card.
  const infoByKey: Record<string, SurveyInfo> = {};
  await Promise.all(survey.destinations.map(async (d) => {
    const info = await resolveSurveyInfo(d).catch(() => null);
    if (info) infoByKey[d.key] = info;
  }));

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
        <div className="absolute inset-0 bg-cover scale-105"
          style={{ backgroundImage: `url('${heroImg}')`, backgroundPosition: `50% ${heroTrip?.focus ?? 50}%` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(1,32,42,0.50) 0%, rgba(1,28,38,0.28) 38%, rgba(1,22,30,0.90) 100%)" }} />
        {heroImg.includes("/api/sat") && <span className="absolute bottom-1 right-2 z-20 text-[9px] font-medium text-white/50">Imagery © Esri</span>}
        <div className="absolute top-0 inset-x-0 h-[3px] z-10" style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 45%,#f47b20)" }} />
        <div className="relative z-10 mt-auto w-full max-w-[720px] mx-auto px-5 sm:px-8 pb-12 pt-16">
          {(survey.eyebrow ?? "By private invitation").trim() !== "" && (
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: "#ffd97a" }}>
              <span aria-hidden>✦</span> {survey.eyebrow ?? "By private invitation"}
            </span>
          )}
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
        ) : isOpenLink ? (
          <SurveyJoin openToken={token} />
        ) : (
          <>
            {survey.quick
              ? <SurveyQuick survey={survey} token={token} existing={response} preview={isPreview} justSaved={saved === "1"} />
              : <SurveyForm survey={survey} token={token} contactName={contactName} existing={response} preview={isPreview} infoByKey={infoByKey} />}
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
