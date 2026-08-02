/**
 * Instant feedback while a member's page loads.
 *
 * Every /account page is a server component behind auth, so none of them can be
 * cached the way the public site is — each navigation waits on a real round
 * trip. With no loading state, the old page just sat there and the new one
 * appeared a beat later. Same problem the admin had.
 *
 * Warm cream and rounded cards rather than the admin's grey: this is the guest
 * side, and a skeleton that doesn't look like the page it precedes is its own
 * kind of jarring.
 */
export default function AccountLoading() {
  const card = "rounded-2xl bg-white border border-[#f0e6d6]";
  return (
    <main className="min-h-[100svh] bg-[#fff7ec]">
      <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-7 sm:py-9 animate-pulse" aria-busy="true" aria-label="Loading">
        {/* the banner */}
        <div className="rounded-3xl h-[168px] mb-7 bg-[#e6ecee]" />

        {/* a card with a couple of rows — the shape of most account pages */}
        <div className={`${card} p-6 mb-5`}>
          <div className="h-3 w-24 rounded bg-[#eef3f4] mb-3" />
          <div className="h-6 w-72 rounded-lg bg-[#e6ecee] mb-4" />
          <div className="h-2 w-full rounded-full bg-[#eef3f4] mb-5" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <span className="w-5 h-5 rounded-full bg-[#eef3f4] shrink-0" />
              <span className="h-3.5 rounded bg-[#eef3f4]" style={{ width: `${58 - i * 12}%` }} />
            </div>
          ))}
        </div>

        <div className={`${card} p-6`}>
          <div className="h-5 w-56 rounded-lg bg-[#e6ecee] mb-2.5" />
          <div className="h-3.5 w-40 rounded bg-[#eef3f4] mb-4" />
          <div className="h-7 w-32 rounded-full bg-[#eef3f4]" />
        </div>
      </div>
    </main>
  );
}
