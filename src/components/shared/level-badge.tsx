import { groupSkillsByTier, type SkillTag } from "@/lib/member-level";

/**
 * A rider's level chip with a hover-card that reveals the coach-verified skills
 * behind it. Replaces the old native `title` tooltip (delayed, OS-styled, easy
 * to miss) with a real popover. CSS-only hover: no JS, escapes its card via
 * absolute + z-50 (the crew grid / byline rows don't clip overflow).
 *
 * Skills are batched by tier (Beginner→Pro) so the list reads as a progression
 * rather than a random scatter. Shared across the crew roster + magazine bylines.
 */
export function LevelBadge({
  level,
  verified,
  skills,
  align = "center",
}: {
  level: string | null;
  verified: boolean;
  skills: SkillTag[];
  align?: "center" | "left";
}) {
  if (!level) return null;
  const hasSkills = skills.length > 0;
  const groups = groupSkillsByTier(skills);

  return (
    <span className="relative inline-flex group/lvl align-middle">
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
          verified ? "bg-[#e1f5ee] text-[#0f6e56]" : "bg-[#eef3f4] text-[#5a6b72]"
        } ${hasSkills ? "cursor-help" : ""}`}
      >
        {verified && <span aria-hidden="true">✓</span>}
        {level}
        {hasSkills && <span className="text-[#5aa991] font-semibold"> · {skills.length}</span>}
      </span>

      {hasSkills && (
        <span
          className={`pointer-events-none absolute z-50 bottom-full mb-2 hidden group-hover/lvl:block ${
            align === "left" ? "left-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          <span className="block w-[230px] rounded-xl bg-white shadow-[0_14px_34px_rgba(0,55,74,0.18)] border border-[#eee4d4] p-3 text-left">
            <span className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-[#0f6e56] mb-2">
              <span aria-hidden="true">✓</span> Coach-verified · {skills.length} {skills.length === 1 ? "skill" : "skills"}
            </span>
            <span className="block space-y-2">
              {groups.map((g) => (
                <span key={g.tier} className="block">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#9aa6ac] mb-1">{g.tier}</span>
                  <span className="flex flex-wrap gap-1">
                    {g.items.map((s) => (
                      <span key={s.label} className="text-[10.5px] font-semibold bg-[#f3ede2] text-[#5a6b72] px-1.5 py-0.5 rounded">
                        {s.label}
                      </span>
                    ))}
                  </span>
                </span>
              ))}
            </span>
          </span>
          {/* little arrow */}
          <span
            className={`absolute top-full ${
              align === "left" ? "left-4" : "left-1/2 -translate-x-1/2"
            } -mt-1 w-2 h-2 rotate-45 bg-white border-r border-b border-[#eee4d4]`}
          />
        </span>
      )}
    </span>
  );
}
