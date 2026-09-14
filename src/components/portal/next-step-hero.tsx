import Link from "next/link";

export type NextStepTone = "coral" | "amber" | "green" | "cyan";

const HERO_TONES: Record<NextStepTone, { bar: string; eyebrow: string; btn: string }> = {
  coral: { bar: "#d85a30", eyebrow: "#993c1d", btn: "bg-[#0f6e56] hover:bg-[#0c5d49]" },
  amber: { bar: "#ca8a04", eyebrow: "#854f0b", btn: "bg-[#0f6e56] hover:bg-[#0c5d49]" },
  green: { bar: "#1d9e75", eyebrow: "#0f6e56", btn: "bg-[#0f6e56] hover:bg-[#0c5d49]" },
  cyan: { bar: "#00afdb", eyebrow: "#0782a0", btn: "bg-[#00afdb] hover:bg-[#15c0ec]" },
};

/**
 * The single "what now?" card. Born on the trip page as its phase- and
 * payment-aware hero; it lives here so the home can show the same card for
 * the same reason, and a rider recognises it in both places.
 *
 * A hash href ("#payment") is an in-page tab switch, which TripView intercepts
 * on a plain anchor. A path href is a real navigation and gets a Link.
 */
export function NextStepHero({ eyebrow, title, body, ctaLabel, ctaHref, tone }: { eyebrow: string; title: string; body: string; ctaLabel?: string; ctaHref?: string; tone: NextStepTone }) {
  const t = HERO_TONES[tone];
  const ctaClass = `inline-flex items-center gap-1.5 mt-3.5 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white ${t.btn} transition-colors`;
  const arrow = <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-6" style={{ borderLeftWidth: 4, borderLeftColor: t.bar }}>
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: t.eyebrow }}>{eyebrow}</p>
      <h2 className="text-[19px] sm:text-[21px] font-black text-[#00374a] mt-1 leading-tight">{title}</h2>
      <p className="text-[14px] text-[#5a6b72] leading-relaxed mt-1.5">{body}</p>
      {ctaLabel && ctaHref && (
        ctaHref.startsWith("#") ? (
          <a href={ctaHref} className={ctaClass}>{ctaLabel}{arrow}</a>
        ) : (
          <Link href={ctaHref} className={ctaClass}>{ctaLabel}{arrow}</Link>
        )
      )}
    </section>
  );
}
