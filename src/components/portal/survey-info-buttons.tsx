"use client";

import { useEffect, useState } from "react";
import type { SurveyInfo } from "@/lib/surveys";

/**
 * The info cards under a survey place card.
 *
 * A survey asks one question — "would you come?" — and the honest answer needs
 * a little more than a blurb: who's coaching, how NP7 coaches, what the spot is
 * actually like, what's included. Inline, all of that buries the question, so
 * each lives behind a card that opens a sheet.
 *
 * The cards are a flex row that fills its width, so two, three or four of them
 * always land as an even, deliberate row rather than a ragged handful of pills —
 * and on a narrow screen they wrap and grow to fill whatever line they land on.
 * Nothing renders for a card whose content is empty, so a half-filled back end
 * degrades to fewer cards, never to a blank sheet.
 */

type Panel = "coach" | "method" | "spot" | "features";

const ICONS: Record<Panel, React.ReactNode> = {
  coach: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  method: <path d="M12 20V10M18 20V4M6 20v-4" />,
  spot: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  features: <path d="M20 6 9 17l-5-5" />,
};

export function SurveyInfoButtons({ info }: { info: SurveyInfo }) {
  const [open, setOpen] = useState<Panel | null>(null);

  // Escape closes, and the page behind stops scrolling while a sheet is up —
  // without it the survey scrolls away underneath on a phone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const hasMethod = !!(info.method && (info.method.intro || info.method.steps.length > 0));
  const cards: { key: Panel; label: string; sub: string; photo?: string | null }[] = [
    ...(info.coaches.length
      ? [{
          key: "coach" as const,
          label: info.coaches.length > 1 ? "Your coaches" : "Your coach",
          sub: info.coaches.map((c) => c.name).join(" & "),
          photo: info.coaches[0].image,
        }]
      : []),
    ...(hasMethod ? [{ key: "method" as const, label: "The NP7 Method", sub: "Seven dimensions · one rider" }] : []),
    ...(info.spot && (info.spot.intro || info.spot.tagline || info.spot.conditions)
      ? [{ key: "spot" as const, label: "The spot", sub: info.spot.name, photo: info.spot.image }]
      : []),
    ...(info.features.length
      ? [{ key: "features" as const, label: "What's included", sub: `${info.features.length} things in your week` }]
      : []),
  ];
  if (cards.length === 0) return null;

  return (
    <>
      {/* The seven-segment medallion stays (it's the brand seal), but on the
          site's WHITE card — the near-black version read as a different
          product next to the cream survey (Nico, 2026-08-24). flex-1 on a
          shared basis, so two halve the row, three go 2+1 with the wrapped
          one filling its line, and four make a tidy 2×2. */}
      <div className="flex flex-wrap gap-3 mt-5">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setOpen(c.key)}
            className="group relative flex flex-1 basis-[300px] items-center gap-4 rounded-2xl p-4 text-left bg-white border border-[#ecdcbb] transition-all hover:-translate-y-0.5 hover:border-[#00afdb] active:translate-y-0 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00afdb] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fdf8ef]"
            style={{ boxShadow: "0 8px 26px rgba(0,55,74,0.08)" }}
          >
            {/* medallion — the same drifting seven-segment ring, holding the
                coach's face or the spot's photo where there is one, so the card
                shows you the thing instead of an icon standing in for it. */}
            <span className="relative grid place-items-center w-[58px] h-[58px] shrink-0">
              <span aria-hidden className="absolute inset-[-30%] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(closest-side, rgba(255,196,46,0.28), transparent 70%)" }} />
              <span aria-hidden className="absolute inset-0 motion-safe:animate-[spin_45s_linear_infinite]">
                <span className="absolute inset-0 rounded-full" style={{
                  background: "conic-gradient(from 210deg, #00afdb, #ffc42e 30%, #f47b20 62%, #00afdb)",
                  WebkitMask: "radial-gradient(closest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))",
                  mask: "radial-gradient(closest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))",
                }} />
                <span className="absolute inset-0 rounded-full" style={{
                  background: "repeating-conic-gradient(from -90deg, transparent 0deg 47.4deg, #ffffff 47.4deg 51.43deg)",
                  WebkitMask: "radial-gradient(closest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))",
                  mask: "radial-gradient(closest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))",
                }} />
              </span>
              <span className="relative grid place-items-center w-[calc(100%-13px)] h-[calc(100%-13px)] rounded-full bg-[#f4ecdd] overflow-hidden">
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo} alt="" className="w-full h-full object-cover" />
                ) : c.key === "method" ? (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[6.5px] font-black tracking-[0.3em] text-[#b0791e]/70 translate-x-[0.15em]">GER</span>
                    <span className="text-[22px] font-black bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(180deg, #ffc42e, #f47b20 55%, #00afdb)" }}>7</span>
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="w-5 h-5 text-[#0782a0]" aria-hidden>{ICONS[c.key]}</svg>
                )}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-black tracking-[-0.02em] text-[#00374a] truncate">{c.label}</span>
              <span aria-hidden className="block h-[2.5px] w-full rounded-full origin-left scale-x-[0.18] group-hover:scale-x-100 transition-transform duration-300 my-1.5" style={{ background: "linear-gradient(90deg, #ffc42e, #f47b20 55%, #00afdb)" }} />
              <span className="block text-[12px] font-semibold text-[#6a7a80] group-hover:text-[#00374a] transition-colors truncate">{c.sub}</span>
            </span>

            <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full border border-[#e5ddca] bg-[#faf6ec] text-[#00374a]/70 transition-all group-hover:bg-[#00afdb]/10 group-hover:text-[#0782a0] group-hover:translate-x-0.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </span>
          </button>
        ))}
      </div>

      {open && (
        <Sheet
          onClose={() => setOpen(null)}
          eyebrow={cards.find((c) => c.key === open)?.label ?? ""}
        >
          {/* One coach gets their photo at full width — you are deciding whether
              to spend a week with this person, and a thumbnail tells you nothing.
              Several coaches fall back to a portrait list, because four banners
              is a scroll, not an introduction. */}
          {open === "coach" && info.coaches.length === 1 && (
            <div>
              {/* The name sits ON the photo, the way the site's heroes work —
                  a picture then a caption underneath read as two things. */}
              <Hero image={info.coaches[0].image} fallback={info.coaches[0].name}
                title={info.coaches[0].name} eyebrow={info.coaches[0].role} />
              {info.coaches[0].bio && (
                <p className="text-[15px] text-[#5a6b72] leading-[1.7] mt-5 whitespace-pre-line [text-wrap:pretty]">{info.coaches[0].bio}</p>
              )}
            </div>
          )}

          {open === "coach" && info.coaches.length > 1 && (
            <div className="space-y-8">
              {info.coaches.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center gap-4">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt="" className="w-[96px] h-[96px] rounded-2xl object-cover shrink-0" />
                    ) : (
                      <span className="w-[96px] h-[96px] rounded-2xl shrink-0 grid place-items-center bg-[#f4ecdd] text-[26px] font-black text-[#b0791e]">
                        {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-[20px] font-black text-[#00374a] leading-tight tracking-[-0.01em]">{c.name}</p>
                      {c.role && <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#b0791e] mt-1">{c.role}</p>}
                    </div>
                  </div>
                  {c.bio && <p className="text-[14.5px] text-[#5a6b72] leading-[1.65] mt-4 whitespace-pre-line [text-wrap:pretty]">{c.bio}</p>}
                </div>
              ))}
            </div>
          )}

          {open === "method" && info.method && (
            <div>
              {/* The method is the thing that distinguishes an NP7 week, and it
                  was reading as a bulleted list. It gets the deep-teal band the
                  experience page gives it, then the steps as real cards. */}
              <div className="relative overflow-hidden rounded-2xl bg-[#00374a] px-6 py-7 mb-6">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_-10%,rgba(0,175,219,0.42),transparent_62%)]" aria-hidden />
                <div className="relative">
                  <p className="text-[10.5px] font-black uppercase tracking-[0.2em] text-[#8fe6f2]">The NP7 Method</p>
                  <h3 className="text-[22px] sm:text-[26px] font-black text-white leading-[1.12] tracking-[-0.02em] mt-2">
                    Not just a session — a system
                  </h3>
                  {info.method.intro && (
                    <p className="text-[14.5px] text-white/80 leading-[1.6] mt-3 [text-wrap:pretty]">{info.method.intro}</p>
                  )}
                </div>
              </div>
              {info.method.steps.length > 0 && (
                <ol className="space-y-2.5">
                  {info.method.steps.map((st, i) => (
                    <li key={i} className="flex gap-3.5 rounded-xl bg-white border border-[#ecdcbb] px-4 py-3.5">
                      <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[#00374a] text-[12px] font-black text-[#8fe6f2] mt-0.5">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-black text-[#00374a] leading-snug">{st.t}</span>
                        {st.d && <span className="block text-[14px] text-[#6a7a80] leading-[1.6] mt-1">{st.d}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {open === "spot" && info.spot && (
            <div>
              {/* A place is a picture first. This panel opened on a wall of text
                  and three grey boxes, which is not how anyone decides where to
                  spend a week. */}
              <Hero image={info.spot.image} fallback={info.spot.name} title={info.spot.name} eyebrow={info.spot.tagline} />
              {info.spot.intro && (
                <p className="text-[14.5px] text-[#5a6b72] leading-[1.65] mt-5 whitespace-pre-line [text-wrap:pretty]">{info.spot.intro}</p>
              )}
              {/* Measured, for the month this trip runs — the same climatology
                  the spotguide and the experience pages read, so a survey can
                  never quietly promise a better month than the spot page does.
                  Falls back to the typed line until the cron has sampled the
                  coordinates. */}
              {info.spot.wind && (
                <div className="mt-6 rounded-2xl bg-[#00374a] p-5">
                  <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#8fe6f2]">
                    Measured · {info.spot.wind.month}
                  </p>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <p className="text-[26px] font-black text-white leading-none tracking-[-0.02em]">{info.spot.wind.pct4}<span className="text-[15px]">%</span></p>
                      <p className="text-[11px] text-white/60 leading-snug mt-1.5">of days<br />Force 4+</p>
                    </div>
                    <div>
                      <p className="text-[26px] font-black text-white leading-none tracking-[-0.02em]">{info.spot.wind.avgWind}<span className="text-[15px]"> kn</span></p>
                      <p className="text-[11px] text-white/60 leading-snug mt-1.5">average<br />daytime wind</p>
                    </div>
                    {info.spot.wind.airTemp != null && (
                      <div>
                        <p className="text-[26px] font-black text-white leading-none tracking-[-0.02em]">{info.spot.wind.airTemp}<span className="text-[15px]">°C</span></p>
                        <p className="text-[11px] text-white/60 leading-snug mt-1.5">average<br />air temp</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(() => {
                const stats = ([
                  // The measured block above already answers "how windy" — don't
                  // print a hand-typed range beside it contradicting the data.
                  ...(info.spot!.wind ? [] : [["Wind", info.spot!.windSpeed] as const]),
                  ["Season", info.spot!.season] as const,
                  ["Conditions", info.spot!.conditions] as const,
                  ["Level", info.spot!.levels] as const,
                ]).filter(([, v]) => !!v);
                if (!stats.length) return null;
                return (
                  <dl className="grid grid-cols-2 gap-2.5 mt-3">
                    {stats.map(([k, v], i) => (
                      <div key={k} className={`rounded-xl bg-white border border-[#ecdcbb] px-4 py-3 ${i === stats.length - 1 && stats.length % 2 === 1 ? "col-span-2" : ""}`}>
                        <dt className="text-[10.5px] font-black uppercase tracking-[0.14em] text-[#b0791e]">{k}</dt>
                        <dd className="text-[14px] font-semibold text-[#00374a] mt-1 leading-snug">{v}</dd>
                      </div>
                    ))}
                  </dl>
                );
              })()}
              {/* The destination's own gallery — the spotguide already has these
                  photos and this sheet was showing none of them. */}
              {info.spot.gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {info.spot.gallery.slice(0, 6).map((g) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={g} src={g} alt="" className="w-full h-[86px] object-cover rounded-lg bg-[#f4ecdd]" />
                  ))}
                </div>
              )}
            </div>
          )}

          {open === "features" && (
            <ul className="space-y-4">
              {info.features.map((f) => (
                <li key={f.name} className="flex gap-3">
                  <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full bg-white border border-[#ecdcbb] mt-0.5" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
                      className="w-3.5 h-3.5 text-[#1f9e57]"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-black text-[#00374a] leading-snug">{f.name}</span>
                    {f.description && <span className="block text-[14px] text-[#6a7a80] leading-[1.6] mt-1">{f.description}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}

/**
 * A sheet's opening image with its name laid over it.
 *
 * The site's heroes all work this way — picture and title as one object, not a
 * photo with a caption below it. Falls back to initials on the warm sand when
 * there is no image, so the shape of the panel never changes.
 */
function Hero({ image, fallback, title, eyebrow }: { image: string | null; fallback: string; title: string; eyebrow?: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl h-[220px] sm:h-[260px] bg-[#002a39]">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-[#f4ecdd] text-[52px] font-black text-[#b0791e]">
          {fallback.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,18,26,0.9) 4%, rgba(0,18,26,0.15) 52%, rgba(0,18,26,0.25) 100%)" }} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 p-5">
        {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ffc42e]">{eyebrow}</p>}
        <p className="text-[26px] sm:text-[30px] font-black text-white leading-[1.08] tracking-[-0.025em] mt-1">{title}</p>
        <span aria-hidden className="block h-[2.5px] w-14 rounded-full mt-2.5" style={{ background: "linear-gradient(90deg, #ffc42e, #f47b20 55%, #00afdb)" }} />
      </div>
    </div>
  );
}

/**
 * The sheet itself: a bottom sheet on a phone, a centred card on a desktop.
 * The header is sticky so the close button is reachable however far down the
 * bio runs, and the content gets real breathing room instead of being packed
 * against the edges.
 */
function Sheet({ eyebrow, onClose, children }: { eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[130] bg-[#00131b]/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={eyebrow}>
      {/* The Method modal is near-full-bleed because it carries a page of
          content. This one is a photo and a few lines — at that width the
          picture swallowed the screen and the bio sat in one thin line across
          1400px. A capped, centred card: the same chrome, the right size. */}
      <div
        className="relative w-full sm:max-w-[560px] max-h-[92svh] sm:max-h-[86svh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#fff7ec] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Same sticky bar as the Method modal on the experience page: cream at
            92% over blur, a hairline rule, the gold eyebrow on the left and a
            deep-teal pill that says what it does on the right. A bare ✕ on a
            white card was the thing that made this feel like a different
            product. */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 bg-[#fff7ec]/92 backdrop-blur border-b border-[#ecdcbb]">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e]">{eyebrow}</span>
          <button type="button" onClick={onClose} aria-label="Back to the survey"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#00374a] text-white text-[12.5px] font-bold pl-3 pr-3.5 py-1.5 hover:bg-[#013242] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
            Back
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain">
          <div className="px-6 sm:px-7 pt-6 sm:pt-7 pb-5">{children}</div>

          {/* The sun-to-sea gradient the rest of the site closes on. */}
          <div className="px-6 sm:px-7 pb-8 text-center">
            <button type="button" onClick={onClose}
              className="inline-flex items-center gap-2 rounded-full font-black text-[14px] px-7 py-3 text-[#3a2a00] transition-transform hover:-translate-y-0.5"
              style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20 60%,#00afdb)" }}>
              Back to the survey <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
