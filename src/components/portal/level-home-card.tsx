import Link from "next/link";

/**
 * Minimal home-dashboard card: a progress ring (toward the next tier) around the
 * member's avatar/initials, their level, and a forward nudge. Links to the full
 * profile. Shows a "set your level" state before they've engaged.
 */
export function LevelHomeCard({
  avatarUrl, initials, displayName, username, level, verified, nextTier, toNext, pct,
}: {
  avatarUrl: string | null; initials: string; displayName: string; username: string | null;
  level: string | null; verified: boolean; nextTier: string | null; toNext: number; pct: number;
}) {
  const ring = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <Link href="/account/level" className="group flex items-center gap-3 bg-white rounded-2xl border border-[#f0e6d6] px-4 py-3 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,55,74,0.07)] transition-all">
      <div className="relative w-[52px] h-[52px] shrink-0">
        <svg viewBox="0 0 36 36" className="w-[52px] h-[52px] -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="16" fill="none" stroke="#eef3f4" strokeWidth="3" />
          <circle cx="18" cy="18" r="16" fill="none" stroke={verified ? "#1aa851" : "#00afdb"} strokeWidth="3" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={100 - ring} />
        </svg>
        <span className="absolute inset-[3px] rounded-full grid place-items-center overflow-hidden">
          {avatarUrl ? (
            <span className="w-full h-full rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${avatarUrl}')` }} />
          ) : (
            <span className="w-full h-full rounded-full grid place-items-center bg-[#e8f6fb] text-[#00748f] text-[13px] font-bold">{initials}</span>
          )}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-[#00374a] truncate">{displayName}{username && <span className="text-[12px] font-normal text-[#9aa6ac]"> @{username}</span>}</p>
        {level ? (
          <p className="text-[12.5px] text-[#6a7a80] mt-0.5 truncate">
            {verified && <span className="text-[#0f6e56] font-semibold">✓ </span>}
            <span className="font-semibold text-[#00374a]">{level}</span>
            {nextTier ? <span> · {toNext} {toNext === 1 ? "skill" : "skills"} to {nextTier}</span> : <span className="text-[#0f6e56]"> · top level 🎉</span>}
          </p>
        ) : (
          <p className="text-[12.5px] text-[#00afdb] font-semibold mt-0.5">Set your level →</p>
        )}
      </div>

      <svg className="w-4 h-4 text-[#c9d4d8] group-hover:text-[#00afdb] transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}
