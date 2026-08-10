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
  const cards: { key: Panel; label: string; sub: string }[] = [
    ...(info.coaches.length
      ? [{
          key: "coach" as const,
          label: info.coaches.length > 1 ? "Your coaches" : "Your coach",
          sub: info.coaches.map((c) => c.name.split(" ")[0]).join(" & "),
        }]
      : []),
    ...(hasMethod ? [{ key: "method" as const, label: "How we coach", sub: "The NP7 method" }] : []),
    ...(info.spot && (info.spot.intro || info.spot.tagline || info.spot.conditions)
      ? [{ key: "spot" as const, label: "The spot", sub: info.spot.name }]
      : []),
    ...(info.features.length
      ? [{ key: "features" as const, label: "What's included", sub: `${info.features.length} things` }]
      : []),
  ];
  if (cards.length === 0) return null;

  return (
    <>
      {/* flex-1 with a shared basis: two cards halve the row, three third it,
          four quarter it, and a card that wraps still fills its own line. */}
      <div className="flex flex-wrap gap-2 mt-4">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setOpen(c.key)}
            className="group flex-1 basis-[160px] text-left rounded-2xl border border-[#e3eaec] bg-white px-3.5 py-3 transition-all hover:border-[#00afdb] hover:shadow-[0_10px_26px_rgba(0,55,74,0.12)] hover:-translate-y-px"
          >
            <span className="flex items-center gap-2.5">
              {/* Deep teal tile, cyan mark — the NP7 pairing, so these read as
                  ours at a glance instead of as a generic outline button. */}
              <span className="shrink-0 grid place-items-center w-8 h-8 rounded-xl bg-[#00374a] group-hover:bg-[#00afdb] transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
                  className="w-[15px] h-[15px] text-[#67d7f0] group-hover:text-white transition-colors" aria-hidden>
                  {ICONS[c.key]}
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black text-[#00374a] leading-tight truncate">{c.label}</span>
                <span className="block text-[11.5px] text-[#8a9aa0] leading-tight truncate mt-0.5">{c.sub}</span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="w-3.5 h-3.5 shrink-0 text-[#c3d2d7] group-hover:text-[#00afdb] transition-colors" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
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
              {info.coaches[0].image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.coaches[0].image} alt={info.coaches[0].name}
                  className="w-full h-[240px] sm:h-[280px] object-cover rounded-2xl bg-[#f4ecdd]" />
              ) : (
                <span className="w-full h-[240px] sm:h-[280px] rounded-2xl grid place-items-center bg-[#f4ecdd] text-[52px] font-black text-[#b0791e]">
                  {info.coaches[0].name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
              )}
              <p className="text-[24px] sm:text-[27px] font-black text-[#00374a] leading-[1.1] tracking-[-0.025em] mt-5">{info.coaches[0].name}</p>
              {info.coaches[0].role && (
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e] mt-1.5">{info.coaches[0].role}</p>
              )}
              {info.coaches[0].bio && (
                <p className="text-[15px] text-[#5a6b72] leading-[1.7] mt-4 whitespace-pre-line [text-wrap:pretty]">{info.coaches[0].bio}</p>
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
              {info.method.intro && (
                <p className="text-[15px] text-[#3a4a50] leading-[1.65] [text-wrap:pretty]">{info.method.intro}</p>
              )}
              {info.method.steps.length > 0 && (
                <ol className="mt-6 space-y-5">
                  {info.method.steps.map((st, i) => (
                    <li key={i} className="flex gap-3.5">
                      <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-white border border-[#ecdcbb] text-[12px] font-black text-[#b0791e] mt-0.5">
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
              <p className="text-[24px] sm:text-[27px] font-black text-[#00374a] leading-[1.1] tracking-[-0.025em]">{info.spot.name}</p>
              {info.spot.tagline && <p className="text-[15px] text-[#6a7a80] mt-1.5">{info.spot.tagline}</p>}
              {info.spot.intro && (
                <p className="text-[14.5px] text-[#5a6b72] leading-[1.65] mt-4 whitespace-pre-line [text-wrap:pretty]">{info.spot.intro}</p>
              )}
              {(() => {
                const stats = ([["Wind", info.spot!.windSpeed], ["Season", info.spot!.season], ["Conditions", info.spot!.conditions]] as const)
                  .filter(([, v]) => !!v);
                if (!stats.length) return null;
                return (
                  <dl className="grid sm:grid-cols-2 gap-2.5 mt-6">
                    {stats.map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-white border border-[#ecdcbb] px-4 py-3">
                        <dt className="text-[10.5px] font-black uppercase tracking-[0.14em] text-[#b0791e]">{k}</dt>
                        <dd className="text-[14px] font-semibold text-[#00374a] mt-1 leading-snug">{v}</dd>
                      </div>
                    ))}
                  </dl>
                );
              })()}
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
