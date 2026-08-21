import { Slideshow } from "@/components/experience/slideshow";
import type { MemberTier } from "@/lib/member-tier";
import { TIER_STEPS, TIER_PERKS } from "@/lib/tier-config";

/** Booking.com-Genius-style tier chip. Hover (or keyboard focus) reveals the
 *  ladder: three rungs, your progress filling toward the next one. */
function TierChip({ tier }: { tier: MemberTier }) {
  const tone =
    tier.key === "legend" ? "bg-gradient-to-r from-[#f47b20] to-[#ffc42e] text-[#3d2202]"
    : tier.key === "crew" ? "bg-[#ffc42e] text-[#4a3403]"
    : "bg-white/90 text-[#01576f]";
  const STEPS = TIER_STEPS;
  // fill per rung: done → 100, the next one → partial, beyond → 0
  const fill = (i: number) => {
    const step = STEPS[i];
    if (tier.trips >= step.min) return 100;
    const prevMin = i > 0 ? STEPS[i - 1].min : 0;
    if (tier.trips >= prevMin) return Math.round(((tier.trips - prevMin) / (step.min - prevMin)) * 100);
    return 0;
  };
  return (
    <span className="relative inline-flex group/tier" tabIndex={0}>
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold tracking-[0.12em] uppercase align-middle cursor-default ${tone}`}>
        ★ {tier.label}
      </span>
      <span className="pointer-events-none absolute left-0 bottom-full mb-2 z-30 w-[248px] opacity-0 translate-y-1 transition-all duration-200 group-hover/tier:opacity-100 group-hover/tier:translate-y-0 group-focus-within/tier:opacity-100 group-focus-within/tier:translate-y-0">
        <span className="block rounded-2xl bg-[#012b3a]/95 backdrop-blur-sm border border-white/10 shadow-[0_16px_40px_rgba(0,20,30,0.45)] p-4">
          <span className="flex gap-1.5 mb-2.5">
            {STEPS.map((s, i) => (
              <span key={s.key} className="flex-1">
                <span className="block h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${fill(i)}%`, background: "linear-gradient(90deg,#ffc42e,#f47b20)" }} />
                </span>
                <span className={`block mt-1.5 text-[9.5px] font-extrabold tracking-[0.14em] uppercase ${tier.key === s.key ? "text-[#ffc42e]" : tier.trips >= s.min ? "text-white/80" : "text-white/40"}`}>{s.label}</span>
              </span>
            ))}
          </span>
          <span className="block text-[12px] font-semibold text-white/85">
            {Number.isInteger(tier.trips) ? tier.trips : tier.trips.toFixed(2)} trip{tier.trips === 1 ? "" : "s"} ridden{tier.toNext ? ` — ${Number.isInteger(tier.toNext) ? tier.toNext : tier.toNext.toFixed(2)} more to ${tier.nextLabel}` : " — top tier"}
          </span>
          {tier.validUntil && (
            <span className="block text-[10.5px] text-white/50 mt-0.5">
              {tier.label} status valid until {new Date(tier.validUntil + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })} — your next trip extends it
            </span>
          )}
          <span className="block mt-2.5 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="block text-[9.5px] font-extrabold tracking-[0.14em] uppercase text-[#ffc42e] mb-1">Your {tier.label} perks</span>
            {TIER_PERKS[tier.key].map((p) => (
              <span key={p} className="block text-[11px] text-white/75 leading-[1.6]">✓ {p}</span>
            ))}
            {tier.nextLabel && (
              <span className="block text-[10.5px] text-white/45 mt-1.5 leading-snug">
                {tier.nextLabel} adds: {TIER_PERKS[tier.nextLabel.toLowerCase() as "crew" | "legend"]
                  .filter((p) => !TIER_PERKS[tier.key].includes(p)).join(" · ")}
              </span>
            )}
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * Member-home hero banner: a slow slideshow of the member's trip photos (or the
 * hero images of the experiences they've booked) behind a fade overlay, tinted to
 * match the active division (experience = teal, hardware = amber).
 */
export function MemberHomeBanner({
  images,
  name,
  subtitle,
  title,
  variant = "experience",
  tier,
  level,
}: {
  images: string[];
  name?: string;
  subtitle: string;
  /** Overrides the default "Hey {name}" heading (e.g. "My trips"). */
  title?: string;
  variant?: "experience" | "hardware";
  /** Loyalty ladder chip; absent before the first trip. */
  tier?: import("@/lib/member-tier").MemberTier | null;
  /** Skill rank + progress into the current band, as a tiny bar. */
  level?: { label: string; pct: number } | null;
}) {
  const overlay =
    variant === "hardware"
      ? "bg-gradient-to-t from-[#3a2300]/95 via-[#3a2300]/55 to-[#3a2300]/30"
      : "bg-gradient-to-t from-[#00374a]/95 via-[#00374a]/55 to-[#00374a]/30";
  const fallback = variant === "hardware" ? "bg-[#b9770a]" : "bg-[#00374a]";

  return (
    <div className="relative rounded-3xl overflow-hidden mb-7 min-h-[190px] sm:min-h-[224px] flex items-end">
      {images.length > 0 ? <Slideshow images={images} interval={6000} /> : <div className={`absolute inset-0 ${fallback}`} />}
      <div className={`absolute inset-0 ${overlay}`} />
      <div className="relative p-6 sm:p-7 text-white">
        <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] drop-shadow-sm">{title ?? `Hey ${name ?? "there"}`}</h1>
        <p className="text-[15px] text-white/85 mt-1.5 max-w-[560px]">{subtitle}</p>
        {(tier || level) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {tier && <TierChip tier={tier} />}
            {level && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm px-3 py-1"
                title={`Your rank: ${level.label}`}>
                <span className="text-[10.5px] font-extrabold tracking-[0.12em] uppercase text-white">{level.label}</span>
                <span className="relative h-1.5 w-14 rounded-full bg-white/25 overflow-hidden">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(6, Math.min(100, level.pct))}%`, background: "linear-gradient(90deg,#ffc42e,#f47b20)" }} />
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
