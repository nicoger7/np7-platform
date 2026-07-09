import Link from "next/link";

export type SetupStep = { key: string; label: string; hint?: string; done: boolean; href: string; accent?: boolean };

/**
 * "Get set up" — an endowed-progress onboarding strip for the member home.
 *
 * Behavioral design, used honestly (per the UX-psychology principle set):
 * - Endowed progress / goal-gradient: the very first step (account created) is
 *   ALWAYS complete, so the bar never starts at a demotivating 0% — the rider
 *   sees they're already on their way and is pulled to finish.
 * - Every step is a REAL, useful action tied to actual account state (no fake
 *   progress). The strip removes itself entirely once nothing's left to do, so
 *   a set-up member is never nagged.
 */
export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const remaining = total - done;
  if (remaining === 0 || total === 0) return null; // fully set up → don't nag
  const pct = Math.round((done / total) * 100);

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac]">Get set up</p>
          <h2 className="text-[17px] font-black tracking-[-0.01em] text-[#00374a] mt-0.5">
            You&apos;re {pct}% there — {remaining} {remaining === 1 ? "step" : "steps"} to go
          </h2>
        </div>
        <span className="shrink-0 text-[13px] font-bold text-[#00afdb]">{done}/{total}</span>
      </div>

      {/* the bar starts filled (account is done), never at 0% */}
      <div className="h-2 rounded-full bg-[#eef3f4] overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ffc42e,#f47b20 55%,#00afdb)" }}
        />
      </div>

      <div className="space-y-1">
        {steps.map((s) =>
          s.done ? (
            <div key={s.key} className="flex items-center gap-3 px-1 py-1.5 text-[13.5px]">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#e1f5ee] text-[#0f6e56] grid place-items-center text-[11px] font-bold">✓</span>
              <span className="text-[#9aa6ac] line-through decoration-[#d3dbde]">{s.label}</span>
            </div>
          ) : (
            <Link key={s.key} href={s.href} className="group flex items-center gap-3 px-1 py-1.5 rounded-lg hover:bg-[#f7fbfc] transition-colors">
              <span className={`shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${s.accent ? "border-[#f47b20]" : "border-[#cdd6d9]"} group-hover:border-[#00afdb]`} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold text-[#00374a]">{s.label}</span>
                {s.hint && <span className="block text-[11.5px] text-[#9aa6ac] leading-snug">{s.hint}</span>}
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-bold text-[#00afdb] opacity-0 group-hover:opacity-100 transition-opacity">
                {s.accent ? "Secure" : "Do it"}
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          )
        )}
      </div>
    </section>
  );
}
