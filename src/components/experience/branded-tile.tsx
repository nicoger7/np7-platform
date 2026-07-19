import { flagSrc, flagFadeMask, resolveTilePlacement, type FlagInfo, type TilePlacement } from "@/lib/experience-tile";

export type BrandedTileProps = {
  /** Raw hero photo (no baked-in text/graphics). */
  photo: string | null;
  /** Big gold place name, e.g. "ALACATI". */
  place: string;
  /** Country flag drape (right side), or null for none. */
  flag?: FlagInfo | null;
  /** Coach shown bottom-right (name always; cutout PNG if available). */
  coachName?: string | null;
  /** Transparent-background coach cutout PNG. */
  coachCutout?: string | null;
  /** Small line under the place name. */
  subtitle?: string;
  /** Optional focal/position overrides (from the placement editor). */
  placement?: TilePlacement | null;
  className?: string;
};

/**
 * The auto-branded experience tile — composited live from a raw hero photo so
 * the team only uploads a photo (no more hand-made graphics). Layers, bottom→top:
 *   1. photo (cover)          2. warm "sun-to-sea" colour wash
 *   3. faded country flag drape (coach side, masked)
 *   4. gold place name + subtitle       5. coach cutout + "with NAME"
 *
 * Fills its parent (which controls size, rounding and overflow-hidden). The photo
 * focal point, coach placement and flag placement/fade all come from `placement`
 * (falling back to the original hardcoded layout when unset).
 */
export function BrandedTile({
  photo,
  place,
  flag,
  coachName,
  coachCutout,
  subtitle = "NP7 Windsurf Experience",
  placement,
  className = "",
}: BrandedTileProps) {
  const p = resolveTilePlacement(placement);
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* 1 — photo. Two nested layers: the OUTER handles the subtle hover zoom
             (GPU-promoted so the rounded clip never "flexes" on the first hover);
             the INNER handles the editor's zoom (grown past the box via a negative
             inset so backgroundPosition can pan in BOTH axes) + focal point. */}
      {photo && (
        <div className="absolute inset-0 overflow-hidden transform-gpu [backface-visibility:hidden] transition-transform duration-500 ease-out group-hover:scale-[1.035]">
          <div
            className="absolute bg-cover"
            style={{
              backgroundImage: `url('${photo}')`,
              backgroundPosition: `${p.photoX}% ${p.photoY}%`,
              // grow the layer by (zoom-100)% on every side → room to pan
              inset: `${-(p.photoZoom - 100) / 2}%`,
            }}
          />
        </div>
      )}

      {/* 2 — sun-to-sea colour wash: warm gold/coral over teal, plus a
             bottom-left darken so the gold title and location label stay legible.
             Deliberately light — the background photo is the hero of the tile. */}
      <div
        className="absolute inset-0 mix-blend-soft-light opacity-70"
        style={{ background: "linear-gradient(115deg, rgba(255,164,38,0.5) 0%, rgba(244,123,32,0.3) 38%, rgba(0,55,74,0.12) 62%, rgba(0,175,219,0.3) 100%)" }}
      />
      {/* brand "sun to sea" tint — a clear-but-transparent yellow→blue veil that
         keeps the CI feeling over any photo (normal blend, sits behind the coach) */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(150deg, rgba(255,196,46,0.22) 0%, rgba(255,196,46,0.05) 44%, rgba(0,175,219,0.09) 68%, rgba(0,175,219,0.25) 100%)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(0,32,44,0.55) 0%, rgba(0,32,44,0.22) 30%, transparent 52%)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,24,34,0.45), transparent 38%)" }}
      />

      {/* 3 — flag drape on the coach side: a translucent flag draped diagonally,
             fading out toward the centre (sits behind the coach cutout) */}
      {flag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagSrc(flag.code)}
          alt=""
          aria-hidden
          className="pointer-events-none absolute h-[135%] object-cover"
          style={{
            right: `${p.flagRight}%`,
            top: `${p.flagTop}%`,
            width: `${p.flagWidth}%`,
            transform: `rotate(${p.flagRotate}deg)`,
            opacity: p.flagOpacity / 100,
            WebkitMaskImage: flagFadeMask(p.flagFade),
            maskImage: flagFadeMask(p.flagFade),
          }}
        />
      )}

      {/* 4 — gold place name + subtitle (bottom-left, clear of the photo's centre) */}
      <div className="absolute left-4 bottom-3.5 max-w-[58%] z-10">
        <h3
          className="font-[family-name:var(--font-display)] uppercase leading-[0.82] tracking-[0.005em] text-[clamp(24px,5.8vw,36px)]"
          style={{
            backgroundImage: "linear-gradient(180deg, #fff2c2 0%, #ffd257 42%, #f4a11f 66%, #d97a12 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 0 rgba(120,60,0,0.55)) drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
          }}
        >
          {place}
        </h3>
        <p className="mt-1 font-extrabold uppercase tracking-[0.015em] leading-tight text-white/95 text-[clamp(8.5px,2vw,11px)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
          {subtitle}
        </p>
      </div>

      {/* 5 — coach cutout + name (placement.coachRight / coachBottom / coachScale) */}
      {coachName && (
        <div className="absolute top-0 z-10 flex items-end" style={{ right: `${p.coachRight}%`, bottom: `${p.coachBottom}%` }}>
          {coachCutout && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coachCutout}
              alt={coachName}
              className="w-auto max-w-none self-end object-contain object-bottom"
              style={{ height: `${p.coachScale}%`, filter: "drop-shadow(-5px 5px 9px rgba(0,0,0,0.45))" }}
            />
          )}
          <span className="absolute right-3 top-3 text-right leading-none">
            <span className="block italic text-white/85 text-[9.5px] mb-0.5">with</span>
            <span className="block font-extrabold uppercase tracking-[0.02em] text-white text-[clamp(10px,2.2vw,13px)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
              {coachName}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
