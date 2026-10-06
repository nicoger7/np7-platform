import { isSatelliteImage } from "@/lib/spotguide-nudge";

/**
 * A destination card's picture: a real photo as it always was, or, when all we
 * hold is the satellite fallback, a lighter branded version of it.
 *
 * Nico, 6 Oct 2026: raw Esri tiles are near-black over water, so a grid with a
 * few of them read as a wall of dark squares that drowned the real photos and
 * made the guide look abandoned. The tile now sits faded into the world's
 * accent over the page's sand, a quiet map-like texture rather than a photo
 * pretending to be one, and says what it is (with the Esri credit the
 * destination hero already carries). The index first tries hard to find a real
 * photo (spotguide-card-photos.ts); this is only what is left when it cannot.
 *
 * No hooks, so the client grid and the server "Where next" row share it.
 * `shade` darkens the foot for a white title laid over the picture.
 */
export function DestCardImage({ src, accent = "#00afdb", shade = false, className = "", children }: {
  src: string;
  accent?: string;
  shade?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!isSatelliteImage(src)) {
    return (
      <div className={`relative bg-cover bg-center bg-[#e9eef0] ${className}`} style={{ backgroundImage: `url('${src}')` }}>
        {shade && <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />}
        {children}
      </div>
    );
  }
  return (
    <div className={`relative isolate overflow-hidden ${className}`}
      // color-mix, not hex alpha: the index passes var(--np7-accent)
      style={{ backgroundColor: `color-mix(in srgb, ${accent} 18%, #fff7ec)` }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-45 mix-blend-luminosity" style={{ backgroundImage: `url('${src}')` }} aria-hidden />
      {/* a touch of sun from the top corner, the brand's warm half */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, rgba(255,196,46,0.18) 0%, transparent 50%)" }} aria-hidden />
      {shade && <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,55,74,0.72) 0%, rgba(0,55,74,0.18) 45%, transparent 70%)" }} aria-hidden />}
      <span className="absolute top-2 right-2.5 text-[9px] font-semibold text-[#00374a]/55">Satellite view · © Esri</span>
      {children}
    </div>
  );
}
