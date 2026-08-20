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
}: {
  images: string[];
  name?: string;
  subtitle: string;
  /** Overrides the default "Hey {name}" heading (e.g. "My trips"). */
  title?: string;
  variant?: "experience" | "hardware";
  /** Loyalty ladder chip beside the greeting; absent before the first trip. */
  tier?: import("@/lib/member-tier").MemberTier | null;
}) {
  const overlay =
    variant === "hardware"
      ? "bg-gradient-to-t from-[#3a2300]/95 via-[#3a2300]/55 to-[#3a2300]/30"
      : "bg-gradient-to-t from-[#00374a]/95 via-[#00374a]/55 to-[#00374a]/30";
  const fallback = variant === "hardware" ? "bg-[#b9770a]" : "bg-[#00374a]";

  return (
    <div className="relative rounded-3xl overflow-hidden mb-7 min-h-[164px] sm:min-h-[190px] flex items-end">
      {images.length > 0 ? <Slideshow images={images} interval={6000} /> : <div className={`absolute inset-0 ${fallback}`} />}
      <div className={`absolute inset-0 ${overlay}`} />
      <div className="relative p-6 sm:p-7 text-white">
        <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] drop-shadow-sm">
          {title ?? `Hey ${name ?? "there"}`}
          {tier && <span className="ml-3 relative -top-1"><TierChip tier={tier} /></span>}
        </h1>
        <p className="text-[15px] text-white/85 mt-1.5 max-w-[560px]">{subtitle}</p>
      </div>
    </div>
  );
}
