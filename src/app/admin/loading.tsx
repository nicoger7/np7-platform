/**
 * Instant feedback on every admin navigation.
 *
 * The admin is already client-rendered — 67 of 76 pages are client components
 * and there is not a single server action in the repo. The lag was never the
 * server doing the rendering; it was that NOTHING happened on screen while the
 * route's payload was in flight. You clicked, the old page sat there, and two
 * round trips later the new one appeared.
 *
 * Next.js shows this file the moment a navigation starts, so the click now has
 * an immediate answer. The page then swaps in when its data lands.
 *
 * Deliberately a shape, not a spinner: a spinner says "wait", a skeleton says
 * "here is the thing you asked for, arriving". It roughly matches the admin's
 * usual header-plus-table layout so the swap doesn't jump.
 */
export default function AdminLoading() {
  const bar = "rounded-lg";
  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto animate-pulse" aria-busy="true" aria-label="Loading">
      {/* title + subtitle */}
      <div className={`${bar} h-7 w-56 mb-2.5`} style={{ backgroundColor: "var(--admin-surface-hover, #e9eef0)" }} />
      <div className={`${bar} h-4 w-80 mb-7`} style={{ backgroundColor: "var(--admin-surface, #f1f4f5)" }} />

      {/* the stat row most admin pages open with */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bar} h-[86px]`} style={{ backgroundColor: "var(--admin-surface, #f1f4f5)", border: "1px solid var(--admin-border, #e4e9eb)" }} />
        ))}
      </div>

      {/* table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border, #e4e9eb)" }}>
        <div className="h-11" style={{ backgroundColor: "var(--admin-surface, #f1f4f5)", borderBottom: "1px solid var(--admin-border, #e4e9eb)" }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 h-14" style={{ borderBottom: "1px solid var(--admin-border, #e4e9eb)" }}>
            <div className={`${bar} h-3.5 flex-1`} style={{ backgroundColor: "var(--admin-surface-hover, #e9eef0)", opacity: 1 - i * 0.13 }} />
            <div className={`${bar} h-3.5 w-24`} style={{ backgroundColor: "var(--admin-surface, #f1f4f5)", opacity: 1 - i * 0.13 }} />
            <div className={`${bar} h-3.5 w-16`} style={{ backgroundColor: "var(--admin-surface, #f1f4f5)", opacity: 1 - i * 0.13 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
