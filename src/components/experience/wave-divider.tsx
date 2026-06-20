type WaveDividerProps = {
  /** colour of the wave fill (the section ABOVE the wave) */
  topColor?: string;
  /** colour the wave sits on (the section BELOW) */
  bottomColor?: string;
  flip?: boolean;
  className?: string;
};

/**
 * Layered, slowly drifting SVG waves used as a section separator.
 * Pure CSS animation — no JS. Two offset wave layers give parallax depth.
 */
export function WaveDivider({
  topColor = "#ffffff",
  bottomColor = "transparent",
  flip = false,
  className = "",
}: WaveDividerProps) {
  return (
    <div
      className={`relative w-full overflow-hidden leading-[0] ${flip ? "rotate-180" : ""} ${className}`}
      style={{ background: bottomColor }}
      aria-hidden
    >
      <svg
        className="block w-[200%] h-[70px] sm:h-[110px] wave-drift"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <path
          d="M0,40 C150,90 350,0 600,40 C850,80 1050,10 1200,45 L1200,120 L0,120 Z"
          fill={topColor}
          opacity="0.55"
        />
        <path
          d="M0,60 C200,20 400,100 600,60 C800,20 1000,100 1200,55 L1200,120 L0,120 Z"
          fill={topColor}
        />
      </svg>
      <style>{`
        @keyframes waveDrift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .wave-drift { animation: waveDrift 18s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .wave-drift { animation: none; } }
      `}</style>
    </div>
  );
}
