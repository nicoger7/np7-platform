import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalUser } from "@/lib/auth";
import { getGuideForMember, type GuideBlock } from "@/lib/portal-data";
import { fmtDates } from "@/lib/portal-status";
import { PortalChrome } from "@/components/portal/portal-chrome";

export const metadata: Metadata = { title: "Your focus points — NP7" };
export const dynamic = "force-dynamic";

/** Phase 3 of the wind.coach integration fills this with the member's deep link
    back into the app. While it is null, nothing clickable renders. */
const CONTINUE_URL: string | null = null;

/** Canonical block order + display labels. Anything wind.coach sends that we
    don't know yet still renders (after the known kinds, in payload order) with
    a prettified label — new block kinds must never silently disappear. */
const BLOCK_ORDER = ["what_to_do", "how", "why", "common_mistakes", "coach_tip"];
const BLOCK_LABELS: Record<string, string> = {
  what_to_do: "What to do",
  how: "How",
  why: "Why",
  common_mistakes: "Common mistakes",
  coach_tip: "Coach tip",
};

function blockLabel(kind: string): string {
  const pretty = kind.replace(/[_-]+/g, " ").trim();
  return BLOCK_LABELS[kind] ?? (pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : "Note");
}

/** Known kinds in canonical order, unknown kinds after them — the sort is
    stable, so blocks of the same (or unknown) kind keep their payload order. */
function orderedBlocks(blocks: GuideBlock[] | undefined): GuideBlock[] {
  const list = (Array.isArray(blocks) ? blocks : []).filter((b) => b && typeof b.text === "string" && b.text.trim());
  const rank = new Map(BLOCK_ORDER.map((k, i) => [k, i]));
  return [...list].sort((a, b) => (rank.get(a.kind) ?? BLOCK_ORDER.length) - (rank.get(b.kind) ?? BLOCK_ORDER.length));
}

type Props = { params: Promise<{ id: string }> };

export default async function GuidePage({ params }: Props) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/account/login");
  const guide = await getGuideForMember(id, user.contactId);
  if (!guide) notFound();

  const firstName = (guide.name ?? user.name ?? "").trim().split(/\s+/)[0] || null;
  const dateLabel = guide.trip_start ? fmtDates(guide.trip_start, guide.trip_end) : null;
  const backHref = guide.booking_id ? `/account/bookings/${guide.booking_id}` : "/account";
  const n = guide.focus_points.length;

  return (
    <>
      <PortalChrome section="experience" />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
          {/* Hero — the TripHero mood: deep ocean block, big display heading. */}
          <section className="relative rounded-[22px] overflow-hidden" style={{ background: "linear-gradient(155deg,#00232f,#00374a 48%,#075b7d)" }}>
            <div className="relative flex items-center justify-between p-4 sm:p-5">
              <Link href={backHref} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/90 hover:text-white transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                {guide.booking_id ? "My trip" : "My account"}
              </Link>
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white border border-white/25 backdrop-blur-sm">
                {n} {n === 1 ? "focus point" : "focus points"}
              </span>
            </div>
            <div className="relative p-5 sm:p-7 pt-3 sm:pt-3">
              <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-white/70 mb-1.5">Your training guide</p>
              <h1 className="text-[26px] sm:text-[32px] font-black tracking-[-0.02em] text-white leading-[1.05]">Your focus points</h1>
              {(guide.trip_label || dateLabel) && (
                <p className="text-[13px] text-white/80 mt-1.5">{[guide.trip_label, dateLabel].filter(Boolean).join(" · ")}</p>
              )}
              <p className="text-[13.5px] font-semibold text-white mt-4">
                🌊 {firstName ? `${firstName}, these` : "These"} are the moves your coach picked for you. Read them before you rig, and keep them in your head on the water.
              </p>
            </div>
          </section>

          {/* One card per focus point, blocks in the canonical coaching order. */}
          <div className="mt-6 space-y-5">
            {guide.focus_points.map((fp, i) => (
              <section key={`${fp.key}-${i}`} className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-6">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* wind.coach's book id, verbatim — it's how the rider finds the chapter in the app */}
                  <span className="shrink-0 font-mono text-[11px] font-bold px-2 py-1 rounded-md bg-[#00afdb]/10 text-[#0782a0] tracking-wide">{fp.key}</span>
                  <h2 className="text-[18px] font-black tracking-tight text-[#00374a] leading-tight">{fp.title}</h2>
                </div>
                {fp.summary && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-2.5">{fp.summary}</p>}

                <div className="mt-4 space-y-4">
                  {orderedBlocks(fp.blocks).map((bl, j) =>
                    bl.kind === "coach_tip" ? (
                      <div key={j} className="rounded-xl bg-[#e9f8fc] border border-[#c8ecf6] p-4">
                        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0782a0] mb-1">Coach tip</p>
                        <p className="text-[14px] text-[#0b4a5e] leading-relaxed whitespace-pre-line">{bl.text}</p>
                      </div>
                    ) : (
                      <div key={j}>
                        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-1">{blockLabel(bl.kind)}</p>
                        <p className="text-[14px] text-[#3a4a50] leading-relaxed whitespace-pre-line">{bl.text}</p>
                      </div>
                    )
                  )}
                </div>

                {/* v1 guides ship no images; when they arrive, a simple row. */}
                {Array.isArray(fp.image_urls) && fp.image_urls.filter(Boolean).length > 0 && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {fp.image_urls.filter(Boolean).map((url, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={url} alt={fp.title} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl border border-[#f0e6d6] bg-[#eef3f4]" />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {guide.coach_note && (
            <section className="mt-6 rounded-2xl p-5 sm:p-6 bg-[#00374a]">
              <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#8fe6f2] mb-2">From your coach</p>
              <p className="text-[14.5px] text-white/90 leading-relaxed whitespace-pre-line">{guide.coach_note}</p>
            </section>
          )}

          {/* Continue in wind.coach — the button exists here, but stays off until
              Phase 3 fills CONTINUE_URL with the member's deep link. Nothing
              clickable renders while it is null. */}
          <div className="mt-8 text-center">
            {CONTINUE_URL ? (
              <a href={CONTINUE_URL} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors">
                Continue in wind.coach
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            ) : (
              <p className="text-[12.5px] text-[#9aa6ac]">Take these with you on the water. See you out there.</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
