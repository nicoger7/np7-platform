/**
 * Layered skill-progress bar. Instead of showing an empty bar for a rider who's
 * only self-rated (demotivating), it fills as: coach-verified (gold, the real
 * thing) → Wind Coach App (purple) → self-logged (grey — "claimed, needs a coach
 * to make it count"). So a self-rater sees lots of grey to "fill up" into gold.
 * `dark` picks colours that read on the dark rank hero vs light cards.
 */
export function SkillBar({ coach, windcoach, self, total, dark = false, className = "" }: {
  coach: number; windcoach: number; self: number; total: number; dark?: boolean; className?: string;
}) {
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  const track = dark ? "rgba(255,255,255,0.10)" : "#eef3f4";
  const grey = dark ? "rgba(255,255,255,0.26)" : "#c7d2d6";
  const seg = "h-full transition-[width] duration-500";
  return (
    <div className={`h-2 rounded-full overflow-hidden flex ${className}`} style={{ background: track }}>
      <span className={seg} style={{ width: `${pct(coach)}%`, background: "#d4a017" }} />
      <span className={seg} style={{ width: `${pct(windcoach)}%`, background: "#7b61c9" }} />
      <span className={seg} style={{ width: `${pct(self)}%`, background: grey }} />
    </div>
  );
}

/**
 * Wind Coach verification isn't built yet. One flag for the whole progression
 * UI so the banner and this legend can't drift apart — flip it when the
 * integration ships.
 */
export const SHOW_WINDCOACH = false;

/** Compact legend for the three fill states. */
export function SkillBarLegend({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  const dot = (c: string) => <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />;
  const txt = dark ? "text-white/60" : "text-[#9aa6ac]";
  const grey = dark ? "rgba(255,255,255,0.26)" : "#c7d2d6";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${txt} ${className}`}>
      <span className="inline-flex items-center gap-1.5">{dot("#d4a017")} coach</span>
      {SHOW_WINDCOACH && <span className="inline-flex items-center gap-1.5">{dot("#7b61c9")} Wind Coach</span>}
      <span className="inline-flex items-center gap-1.5">{dot(grey)} self-rated</span>
    </div>
  );
}
