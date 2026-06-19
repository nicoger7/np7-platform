import { Slideshow } from "@/components/experience/slideshow";

/**
 * Member-home hero banner: a slow slideshow of the member's trip photos (or the
 * hero images of the experiences they've booked) behind a fade overlay, tinted to
 * match the active division (experience = teal, hardware = amber).
 */
export function MemberHomeBanner({
  images,
  name,
  subtitle,
  variant = "experience",
}: {
  images: string[];
  name: string;
  subtitle: string;
  variant?: "experience" | "hardware";
}) {
  const overlay =
    variant === "hardware"
      ? "bg-gradient-to-t from-[#3a2300]/95 via-[#3a2300]/55 to-[#3a2300]/30"
      : "bg-gradient-to-t from-[#00374a]/95 via-[#00374a]/55 to-[#00374a]/30";
  const fallback = variant === "hardware" ? "bg-[#b9770a]" : "bg-[#00374a]";

  return (
    <div className="relative rounded-3xl overflow-hidden mb-7 min-h-[210px] sm:min-h-[260px] flex items-end">
      {images.length > 0 ? <Slideshow images={images} interval={6000} /> : <div className={`absolute inset-0 ${fallback}`} />}
      <div className={`absolute inset-0 ${overlay}`} />
      <div className="relative p-6 sm:p-9 text-white">
        <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] drop-shadow-sm">Hey {name}</h1>
        <p className="text-[15px] text-white/85 mt-1.5 max-w-[560px]">{subtitle}</p>
      </div>
    </div>
  );
}
