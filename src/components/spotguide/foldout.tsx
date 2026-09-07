import type { ReactNode } from "react";

/**
 * A spot-card foldout: a pill while shut, a card once open.
 *
 * The old version was a flat sand-coloured box with a grey uppercase micro-
 * label and a faint chevron — which is exactly how every *static* panel on the
 * card looks, so nothing said "tap me". Here interactive rows are the only
 * raised, rounded-full, white things on the card: icon chip on the left says
 * what is inside, the answer sits on the right so most riders never need to
 * open it at all, and the chevron sits in its own tappable-looking disc.
 *
 * Still a native <details>: the content stays in the server HTML for search
 * engines and it opens with no JavaScript. Styling lives in globals.css
 * (`.np7-fold`) because the open/closed states need real CSS selectors.
 */
export function Foldout({
  icon, label, meta, value, valueCta = false, accent = "#00afdb", defaultOpen = false, children,
}: {
  icon: ReactNode;
  label: string;
  /** Tiny chip after the label — provenance, not content ("modeled"). */
  meta?: string;
  /** The payoff, readable while shut ("Windy Jun–Sep"). */
  value?: string;
  /** Colour the value in the accent — for values that are really an invitation. */
  valueCta?: boolean;
  accent?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const valueCls = `truncate text-[12.5px] font-semibold ${valueCta ? "" : "text-[#8b989e]"}`;
  const valueStyle = valueCta ? { color: accent } : undefined;
  return (
    <details open={defaultOpen} className="np7-fold" style={{ ["--fa" as string]: accent }}>
      <summary>
        <span className="np7-fold-icon" aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-bold tracking-[-0.01em] text-[#00374a] leading-tight">{label}</span>
            {meta && <span className="np7-fold-meta">{meta}</span>}
          </span>
          {/* narrow screens: the answer goes under the label instead of
              competing with it for the same line */}
          {value && <span className={`sm:hidden mt-0.5 block ${valueCls}`} style={valueStyle}>{value}</span>}
        </span>
        {value && <span className={`hidden sm:block shrink-0 max-w-[46%] ${valueCls}`} style={valueStyle}>{value}</span>}
        <span className="np7-fold-chev" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </summary>
      <div className="np7-fold-body">{children}</div>
    </details>
  );
}

/** Monthly wind climatology — bars. */
export const FoldIconStats = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V13" /><path d="M9.5 20V5" /><path d="M15 20V9" /><path d="M20.5 20v-5" />
  </svg>
);

/** Which forecast to trust — wind. */
export const FoldIconWind = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.6 4.6A2 2 0 1 1 11 8H3" /><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H3" /><path d="M12.6 19.4A2 2 0 1 0 14 16H3" />
  </svg>
);
