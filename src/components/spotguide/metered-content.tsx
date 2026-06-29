import { SignupGate } from "@/components/blog/signup-gate";

/**
 * Metered access that stays SEO-safe. The children are ALWAYS rendered into the
 * server HTML (so search engines index the full guide — no cloaking), but for
 * anonymous visitors the section is clipped to a teaser and a free-signup wall
 * is shown. Logged-in members get the full, interactive content. Pair with the
 * JSON-LD `isAccessibleForFree:false` emitted by the page (selector `.sg-gated`).
 */
export function MeteredContent({ gated, accent = "#00afdb", children }: { gated: boolean; accent?: string; children: React.ReactNode }) {
  if (!gated) return <>{children}</>;
  return (
    <div className="sg-gated relative">
      <div className="relative max-h-[540px] overflow-hidden">
        {/* content is present in the DOM (indexable) but not interactive for anon */}
        <div className="pointer-events-none select-none">{children}</div>
      </div>
      <SignupGate accent={accent} />
    </div>
  );
}
