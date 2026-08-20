import { Slideshow } from "@/components/experience/slideshow";
import type { MemberTier } from "@/lib/member-tier";

/** Booking.com-Genius-style tier chip: quiet, but unmistakably a status. */
function TierChip({ tier }: { tier: MemberTier }) {
  const tone =
    tier.key === "legend" ? "bg-gradient-to-r from-[#f47b20] to-[#ffc42e] text-[#3d2202]"
    : tier.key === "crew" ? "bg-[#ffc42e] text-[#4a3403]"
    : "bg-white/90 text-[#01576f]";
  const hint = tier.toNext ? `${tier.trips} trip${tier.trips === 1 ? "" : "s"} ridden · ${tier.toNext} more to ${tier.nextLabel}` : `${tier.trips} trips ridden`;
  return (
    <span title={hint}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold tracking-[0.12em] uppercase align-middle ${tone}`}>
      ★ {tier.label}
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
