import Link from "next/link";

/**
 * Home-dashboard card: a bigger avatar inside a progress ring (toward the next
 * level), with the rider's name + handle, then a level chip and a forward nudge.
 * Links to the Progress tab. Shows a "set your level" state before they engage.
 */
export function LevelHomeCard({
  avatarUrl, initials, displayName, username, level, verified, nextTier, toNext, pct,
}: {
  avatarUrl: string | null; initials: string; displayName: string; username: string | null;
  level: string | null; verified: boolean; nextTier: string | null; toNext: number; pct: number;
}) {
  const ring = Math.max(0, Math.min(100, Math.round(pct)));
  const circ = 103.67; // 2πr for r=16.5
  return (
    <Link href="/account/level" className="group flex items-center gap-4 bg-white rounded-2xl border border-[#f0e6d6] px-4 py-4 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,55,74,0.07)] transition-all">
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="16.5" fill="none" stroke="#eef3f4" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="16.5" fill="none" stroke={verified ? "#1aa851" : "#00afdb"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - ring / 100)} />
        </svg>
        <span className="absolute inset-[4px] rounded-full overflow-hidden grid place-items-center">
          {avatarUrl ? (
            <span className="w-full h-full rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${avatarUrl}')` }} />
          ) : (
            <span className="w-full h-full rounded-full grid place-items-center bg-[#e8f6fb] text-[#00748f] text-[17px] font-bold">{initials}</span>
          )}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[15.5px] font-extrabold tracking-[-0.01em] text-[#00374a] truncate leading-tight">{displayName}</p>
        {username && <p className="text-[12px] text-[#9aa6ac] truncate">@{username}</p>}
        {level ? (
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${verified ? "bg-[#e1f5ee] text-[#0f6e56]" : "bg-[#eef3f4] text-[#5a6b72]"}`}>
              {verified && <span aria-hidden="true">✓</span>}{level}
            </span>
            <span className="text-[12px] text-[#6a7a80] truncate">{nextTier ? `${toNext} ${toNext === 1 ? "skill" : "skills"} to ${nextTier}` : "top level 🎉"}</span>
          </div>
        ) : (
          <p className="text-[12.5px] text-[#00afdb] font-semibold mt-1">Set your level →</p>
        )}
      </div>

      <svg className="w-4 h-4 text-[#c9d4d8] group-hover:text-[#00afdb] transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}
